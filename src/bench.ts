/**
 * Runs coding agents on the tasks and grades what they write.
 *
 *   npm run bench -- --models sonnet,haiku --conditions none,docs --tasks 01,15 --concurrency 3
 *
 * One attempt = one model, one condition, one task:
 *   1. A fresh workspace in the system temp folder holds TASK.md, wrangler.jsonc
 *      and a stub src/index.ts. The hidden tests are never in it.
 *   2. Claude Code, headless, writes src/index.ts with file tools only. It can't
 *      run code, so this measures writing a Worker right the first time.
 *      Condition "docs" also gives it Cloudflare's documentation search.
 *   3. The file is graded against the hidden tests inside workerd.
 * Everything lands in runs/<run id>/: the code, the agent's trace, and results.json.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ClaudeCodeRunner, type AgentRunner, type AgentSpec } from "./claude.js";
import { copyTaskFiles, grade, ROOT, TASKS, type Grade } from "./grade.js";

export const CONDITIONS = {
  none: { label: "no docs", docs: false },
  docs: { label: "Cloudflare docs search", docs: true },
} as const;
export type Condition = keyof typeof CONDITIONS;

const DOCS_MCP = { mcpServers: { "cloudflare-docs": { type: "http", url: "https://docs.mcp.cloudflare.com/mcp" } } };
const DOCS_TOOLS = ["mcp__cloudflare-docs__search_cloudflare_documentation", "mcp__cloudflare-docs__migrate_pages_to_workers_guide"];
const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

const STUB = `export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  },
};
`;

const SYSTEM = `You write Cloudflare Workers in TypeScript (ES module syntax).
The task is in TASK.md and the Worker's bindings are in wrangler.jsonc. Write the complete Worker in src/index.ts: every handler, and every class the bindings name, exported from that one file. You can't run, build or test code here, so get it right by reading carefully. When src/index.ts is finished, reply with one sentence saying what you built.`;
const DOCS_NOTE = `\nYou can search Cloudflare's developer documentation with the search_cloudflare_documentation tool.`;

const SCHEMA = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false };

export interface Attempt extends Grade {
  model: string;
  condition: Condition;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  docSearches: number;
  agentError?: string;
}

export async function listTasks(filter: string[] = []): Promise<string[]> {
  return (await readdir(TASKS)).filter((t) => !filter.length || filter.some((f) => t.startsWith(f))).sort();
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
    await writeFile(path.join(work, "src", "index.ts"), STUB);

    const docs = CONDITIONS[condition].docs;
    const spec: AgentSpec = {
      name: `${model}/${condition}/${task}`,
      prompt: "Do the task in TASK.md.",
      systemPrompt: SYSTEM + (docs ? DOCS_NOTE : ""),
      model,
      schema: SCHEMA,
      tools: FILE_TOOLS,
      cwd: work,
      timeoutMs: 600_000,
      logPath: path.join(out, "trace.jsonl"),
      ...(docs ? { mcpConfig: DOCS_MCP, mcpTools: DOCS_TOOLS } : {}),
    };
    const r = await runner.run(spec);
    const code = await readFile(path.join(work, "src", "index.ts"), "utf8");
    await writeFile(path.join(out, "index.ts"), code);

    const g: Grade = r.error && code === STUB
      ? { task, passed: 0, total: 0, solved: false, cases: [], error: "the agent wrote no code" }
      : await grade(task, code, gradeDir(out));
    const result: Attempt = {
      ...g,
      model,
      condition,
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      docSearches: r.toolCalls.filter((c) => c.name.startsWith("mcp__cloudflare-docs__")).length,
      ...(r.error ? { agentError: r.error } : {}),
    };
    await writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
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
  const concurrency = Number(arg("concurrency", "3"));
  const id = arg("run", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  const runDir = path.join(ROOT, "runs", id);
  await mkdir(runDir, { recursive: true });

  const jobs = models.flatMap((m) => conditions.flatMap((c) => tasks.map((t) => ({ m, c, t }))));
  console.log(`run ${id}: ${jobs.length} attempts (${models.join(", ")} x ${conditions.join(", ")} x ${tasks.length} tasks), ${concurrency} at a time`);
  const runner = new ClaudeCodeRunner();
  let done = 0;
  const attempts = await pool(jobs, concurrency, async ({ m, c, t }) => {
    const a = await attempt(runner, runDir, t, m, c);
    done++;
    const mark = a.solved ? "pass" : a.error || a.agentError ? "ERR " : "fail";
    console.log(`[${String(done).padStart(3)}/${jobs.length}] ${mark} ${m.padEnd(7)} ${c.padEnd(5)} ${t.padEnd(18)} ${a.passed}/${a.total}  ${(a.durationMs / 1000).toFixed(0)}s${a.docSearches ? `  ${a.docSearches} doc searches` : ""}${a.agentError ? `  agent: ${a.agentError.slice(0, 80)}` : a.error ? `  ${a.error.split("\n")[0].slice(0, 80)}` : ""}`);
    return a;
  });
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ id, models, conditions, tasks, attempts }, null, 2) + "\n");
  console.log(`\nwrote runs/${id}/results.json — make the tables with: npm run report -- ${id}`);
}
