/**
 * Runs coding agents on the tasks and grades what they write.
 *
 *   npm run bench -- --models sonnet,haiku --conditions none,docs --tasks 01,15 --concurrency 3
 *
 * One attempt = one model, one condition, one task:
 *   1. A fresh workspace in the system temp folder holds TASK.md, wrangler.jsonc
 *      and a stub src/index.ts. The hidden tests are never in it.
 *   2. Claude Code, headless, writes src/index.ts with file tools only.
 *      Condition "docs" also gives it Cloudflare's documentation search.
 *      Condition "run" lets it write its own tests and run them in workerd with
 *      one MCP tool, run_tests (src/test-mcp.ts). It gets no shell.
 *      The "fix-" conditions start from the task's naive.ts, a plausible but
 *      buggy Worker, and ask the agent to find and fix the bugs.
 *   3. The file is graded against the hidden tests inside workerd.
 * Everything lands in runs/<run id>/: the code, the agent's trace, and results.json.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ClaudeCodeRunner, type AgentRunner, type AgentSpec } from "./claude.js";
import { copyTaskFiles, grade, readSrc, ROOT, TASKS, type Grade } from "./grade.js";

export const CONDITIONS = {
  none: { label: "no docs", docs: false, run: false, fix: false },
  docs: { label: "Cloudflare docs search", docs: true, run: false, fix: false },
  run: { label: "can run its own tests", docs: false, run: true, fix: false },
  "fix-none": { label: "fix a buggy Worker, can't run code", docs: false, run: false, fix: true },
  "fix-run": { label: "fix a buggy Worker, can run its own tests", docs: false, run: true, fix: true },
} as const;
export type Condition = keyof typeof CONDITIONS;

const DOCS_MCP = { mcpServers: { "cloudflare-docs": { type: "http", url: "https://docs.mcp.cloudflare.com/mcp" } } };
const DOCS_TOOLS = ["mcp__cloudflare-docs__search_cloudflare_documentation", "mcp__cloudflare-docs__migrate_pages_to_workers_guide"];
const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
/** The "run" conditions' only way to execute code: one MCP tool that runs the workspace's tests. */
export const RUN_TOOL = "mcp__bench__run_tests";
function runMcp(work: string) {
  return { mcpServers: { bench: { type: "stdio", command: path.join(ROOT, "node_modules", ".bin", "tsx"), args: [path.join(ROOT, "src", "test-mcp.ts"), work] } } };
}

const STUB = `export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  },
};
`;

const BASE = `You write Cloudflare Workers in TypeScript (ES module syntax).
The task is in TASK.md and the Worker's bindings are in wrangler.jsonc. The Worker's entry point is src/index.ts, which exports every handler and every class the bindings name. You may split the code into more files under src/.`;
const NO_RUN = `\nYou can't run, build or test code here, so get it right by reading carefully.`;
const RUN = `\nYou can test your work: write Vitest tests in test/*.test.ts and run them with the run_tests tool, which runs them inside workerd, the Workers runtime, with the bindings from wrangler.jsonc. test/example.test.ts shows how a test calls the Worker. There is no shell.`;
const WRITE_TASK = `\nWrite the Worker. When it is finished, reply with one sentence saying what you built.`;
const FIX_TASK = `\nsrc/index.ts was written for TASK.md, but users report that it doesn't always do what TASK.md says. Find and fix every bug, keeping what already works. When it is fixed, reply with one sentence saying what was wrong.`;
const DOCS_NOTE = `\nYou can search Cloudflare's developer documentation with the search_cloudflare_documentation tool.`;

export function systemPrompt(c: Condition): string {
  const k = CONDITIONS[c];
  return BASE + (k.run ? RUN : NO_RUN) + (k.fix ? FIX_TASK : WRITE_TASK) + (k.docs ? DOCS_NOTE : "");
}

const EXAMPLE_TEST = `import { exports, env } from "cloudflare:workers";
import { it, expect } from "vitest";

// exports.default is this Worker; env holds the bindings from wrangler.jsonc.
it("answers a request", async () => {
  const res = await exports.default.fetch(new Request("http://example.test/"));
  expect(res.status).toBeGreaterThan(0);
});
`;
const VITEST_CONFIG = `import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { testTimeout: 20000 },
});
`;

/** What a "run" workspace adds: the test runner, a config, an example test, and the repo's node_modules. */
async function addTestHarness(work: string): Promise<void> {
  await mkdir(path.join(work, "test"));
  await writeFile(path.join(work, "test", "example.test.ts"), EXAMPLE_TEST);
  await writeFile(path.join(work, "vitest.config.ts"), VITEST_CONFIG);
  await writeFile(path.join(work, "package.json"), JSON.stringify({ name: "task", private: true, type: "module", scripts: { test: "vitest run" } }, null, 2) + "\n");
  await symlink(path.join(ROOT, "node_modules"), path.join(work, "node_modules"), "dir");
}

const SCHEMA = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false };

export interface Attempt extends Grade {
  model: string;
  condition: Condition;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  docSearches: number;
  /** Times the agent called run_tests (the "run" conditions). */
  testRuns: number;
  /** Tool calls Claude Code refused for lack of permission. */
  blockedCommands: number;
  /** The models Claude Code reports having used, which can differ from the name asked for. */
  modelsUsed?: string[];
  /** How many source files the agent left in src/. */
  srcFiles?: number;
  agentError?: string;
}

export async function listTasks(filter: string[] = []): Promise<string[]> {
  return (await readdir(TASKS)).filter((t) => !filter.length || filter.some((f) => t.startsWith(f))).sort();
}

/** Tasks that ship a naive.ts, the starting point for the "fix-" conditions. */
export async function hasNaive(task: string): Promise<boolean> {
  return readFile(path.join(TASKS, task, "naive.ts"), "utf8").then(() => true, () => false);
}

export async function attempt(runner: AgentRunner, runDir: string, task: string, model: string, condition: Condition): Promise<Attempt> {
  const out = path.join(runDir, condition, model, task);
  await mkdir(out, { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), "workers-bench-"));
  try {
    await mkdir(path.join(work, "src"));
    await cp(path.join(TASKS, task, "task.md"), path.join(work, "TASK.md"));
    await cp(path.join(TASKS, task, "wrangler.jsonc"), path.join(work, "wrangler.jsonc"));
    await copyTaskFiles(task, work);
    const k = CONDITIONS[condition];
    const start = k.fix ? await readFile(path.join(TASKS, task, "naive.ts"), "utf8") : STUB;
    await writeFile(path.join(work, "src", "index.ts"), start);
    if (k.run) await addTestHarness(work);

    const docs = k.docs;
    const spec: AgentSpec = {
      name: `${model}/${condition}/${task}`,
      prompt: k.fix ? "Fix src/index.ts so it does what TASK.md says." : "Do the task in TASK.md.",
      systemPrompt: systemPrompt(condition),
      model,
      schema: SCHEMA,
      tools: FILE_TOOLS,
      cwd: work,
      timeoutMs: 600_000,
      logPath: path.join(out, "trace.jsonl"),
      ...mcpFor(docs, k.run, work),
    };
    const r = await runner.run(spec);
    const files = await readSrc(path.join(work, "src"));
    const code = files["index.ts"] ?? "";
    await writeFile(path.join(out, "index.ts"), code);
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(out, "src", rel)), { recursive: true });
      await writeFile(path.join(out, "src", rel), text);
    }

    const g: Grade = r.error && code === start && !k.fix
      ? { task, passed: 0, total: 0, solved: false, cases: [], error: "the agent wrote no code" }
      : await grade(task, files, gradeDir(out));
    const result: Attempt = {
      ...g,
      model,
      condition,
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      docSearches: r.toolCalls.filter((c) => c.name.startsWith("mcp__cloudflare-docs__")).length,
      testRuns: r.toolCalls.filter((c) => c.name === RUN_TOOL).length,
      blockedCommands: r.denied ?? 0,
      modelsUsed: r.modelsUsed ?? [],
      srcFiles: Object.keys(files).length,
      ...(r.error ? { agentError: r.error } : {}),
    };
    await writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function mcpFor(docs: boolean, run: boolean, work: string): Pick<AgentSpec, "mcpConfig" | "mcpTools"> {
  if (!docs && !run) return {};
  const servers = { ...(docs ? DOCS_MCP.mcpServers : {}), ...(run ? runMcp(work).mcpServers : {}) };
  return { mcpConfig: { mcpServers: servers }, mcpTools: [...(docs ? DOCS_TOOLS : []), ...(run ? [RUN_TOOL] : [])] };
}

/** Grading folders must sit inside this repo so the test runtime resolves from its node_modules. */
function gradeDir(out: string): string {
  const rel = path.relative(ROOT, out);
  return path.join(ROOT, ".grade", rel.startsWith("..") ? out.replace(/[^\w.-]+/g, "_") : rel);
}

/** Runs jobs with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

if (import.meta.url === `file://${process.argv[1]}`) {
  const models = list(arg("models", "sonnet"));
  const conditions = list(arg("conditions", "none,docs")) as Condition[];
  for (const c of conditions) if (!(c in CONDITIONS)) throw new Error(`unknown condition ${c}; use ${Object.keys(CONDITIONS).join(", ")}`);
  const tasks = await listTasks(list(arg("tasks", "")));
  const fixable = new Set((await Promise.all(tasks.map(async (t) => ((await hasNaive(t)) ? t : null)))).filter(Boolean));
  const concurrency = Number(arg("concurrency", "3"));
  const id = arg("run", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  const runDir = path.join(ROOT, "runs", id);
  await mkdir(runDir, { recursive: true });

  const jobs = models.flatMap((m) => conditions.flatMap((c) => tasks.filter((t) => !CONDITIONS[c].fix || fixable.has(t)).map((t) => ({ m, c, t }))));
  console.log(`run ${id}: ${jobs.length} attempts (${models.join(", ")} x ${conditions.join(", ")} x ${tasks.length} tasks), ${concurrency} at a time`);
  const runner = new ClaudeCodeRunner();
  let done = 0;
  const attempts = await pool(jobs, concurrency, async ({ m, c, t }) => {
    let a = await attempt(runner, runDir, t, m, c);
    // Parallel Claude Code starts sometimes report "Not logged in" before the agent runs. That is setup, not the model: try once more.
    if (a.error === "the agent wrote no code" && /not logged in/i.test(a.agentError ?? "")) a = await attempt(runner, runDir, t, m, c);
    done++;
    const mark = a.solved ? "pass" : a.error || a.agentError ? "ERR " : "fail";
    console.log(`[${String(done).padStart(3)}/${jobs.length}] ${mark} ${m.padEnd(7)} ${c.padEnd(8)} ${t.padEnd(18)} ${a.passed}/${a.total}  ${(a.durationMs / 1000).toFixed(0)}s${a.docSearches ? `  ${a.docSearches} doc searches` : ""}${a.testRuns ? `  ${a.testRuns} test runs` : ""}${a.blockedCommands ? `  ${a.blockedCommands} commands blocked` : ""}${a.agentError ? `  agent: ${a.agentError.slice(0, 80)}` : a.error ? `  ${a.error.split("\n")[0].slice(0, 80)}` : ""}`);
    return a;
  });
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ id, models, conditions, tasks, attempts }, null, 2) + "\n");
  console.log(`\nwrote runs/${id}/results.json — make the tables with: npm run report -- ${id}`);
}
