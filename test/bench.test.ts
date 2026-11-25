import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attempt, pool, systemPrompt } from "../src/bench.js";
import type { AgentResult, AgentRunner, AgentSpec } from "../src/claude.js";
import { TASKS } from "../src/grade.js";
import { markdown, median, summarize } from "../src/report.js";

/** A stand-in for Claude Code: writes the given code into the workspace, or nothing. */
class FakeRunner implements AgentRunner {
  seen: AgentSpec[] = [];
  constructor(private code: string | null, private error?: string) {}
  async run(spec: AgentSpec): Promise<AgentResult> {
    this.seen.push(spec);
    if (this.code !== null) await writeFile(path.join(spec.cwd!, "src", "index.ts"), this.code);
    return { output: { summary: "done" }, durationMs: 1000, costUsd: 0, inputTokens: 1, outputTokens: 1, toolCalls: [], ...(this.error ? { error: this.error } : {}) };
  }
}

describe("attempt", () => {
  it("grades the code the agent wrote", async () => {
    const run = await mkdtemp(path.join(os.tmpdir(), "wb-test-"));
    const ref = await readFile(path.join(TASKS, "01-json-methods", "reference.ts"), "utf8");
    const a = await attempt(new FakeRunner(ref), run, "01-json-methods", "fake", "none");
    expect(a.solved).toBe(true);
    expect(a.passed).toBe(a.total);
    expect(await readFile(path.join(run, "none", "fake", "01-json-methods", "index.ts"), "utf8")).toBe(ref);
  });
  it("the workspace has the task but not the tests", async () => {
    const r = new FakeRunner(null, "gave up");
    const run = await mkdtemp(path.join(os.tmpdir(), "wb-test-"));
    let files: string[] = [];
    r.run = async function (spec) {
      const { readdir } = await import("node:fs/promises");
      files = (await readdir(spec.cwd!, { recursive: true })).map(String).sort();
      return FakeRunner.prototype.run.call(this, spec);
    };
    const a = await attempt(r, run, "02-router", "fake", "none");
    expect(files).toEqual(["TASK.md", "src", "src/index.ts", "wrangler.jsonc"]);
    expect(a.solved).toBe(false);
    expect(a.error).toBe("the agent wrote no code");
  });
  it("only the docs condition gets the docs server", async () => {
    const run = await mkdtemp(path.join(os.tmpdir(), "wb-test-"));
    const r = new FakeRunner(null, "skip");
    await attempt(r, run, "01-json-methods", "fake", "none");
    await attempt(r, run, "01-json-methods", "fake", "docs");
    expect(r.seen[0].mcpConfig).toBeUndefined();
    expect(r.seen[1].mcpTools).toContain("mcp__cloudflare-docs__search_cloudflare_documentation");
    expect(r.seen.every((s) => s.tools.every((t) => ["Read", "Write", "Edit", "Glob", "Grep"].includes(t)))).toBe(true);
  });
  it("code that doesn't load scores zero with a reason", async () => {
    const run = await mkdtemp(path.join(os.tmpdir(), "wb-test-"));
    const a = await attempt(new FakeRunner("export default {{{ nope"), run, "01-json-methods", "fake", "none");
    expect(a.solved).toBe(false);
    expect(a.passed).toBe(0);
    expect(a.error ?? a.cases.find((c) => !c.passed)?.message).toBeTruthy();
  });
});

describe("run and fix conditions", () => {
  it("run: the workspace can test itself through run_tests, with no shell", async () => {
    const r = new FakeRunner(null, "skip");
    let files: string[] = [];
    const orig = r.run.bind(r);
    r.run = async (spec) => {
      const { readdir } = await import("node:fs/promises");
      files = (await readdir(spec.cwd!)).map(String).sort();
      return orig(spec);
    };
    await attempt(r, await mkdtemp(path.join(os.tmpdir(), "wb-test-")), "01-json-methods", "fake", "run");
    expect(files).toEqual(["TASK.md", "node_modules", "package.json", "src", "test", "vitest.config.ts", "wrangler.jsonc"]);
    expect(r.seen[0].tools).not.toContain("Bash");
    expect(r.seen[0].mcpTools).toEqual(["mcp__bench__run_tests"]);
    expect(systemPrompt("run")).toContain("run_tests");
    expect(systemPrompt("none")).toContain("can't run");
  });
  it("fix: starts from the task's naive.ts", async () => {
    let start = "";
    const r = new FakeRunner(null, "skip");
    const orig = r.run.bind(r);
    r.run = async (spec) => { start = await readFile(path.join(spec.cwd!, "src", "index.ts"), "utf8"); return orig(spec); };
    const a = await attempt(r, await mkdtemp(path.join(os.tmpdir(), "wb-test-")), "29-d1-transfer", "fake", "fix-none");
    expect(start).toBe(await readFile(path.join(TASKS, "29-d1-transfer", "naive.ts"), "utf8"));
    expect(r.seen[0].tools).not.toContain("Bash");
    expect(systemPrompt("fix-none")).toContain("Find and fix every bug");
    // Untouched naive code is graded as it is, and fails.
    expect(a.solved).toBe(false);
    expect(a.passed).toBeGreaterThan(0);
  });
});

it("run_tests runs the workspace's tests and reports failures", async () => {
  const { runTests } = await import("../src/test-mcp.js");
  const { ROOT } = await import("../src/grade.js");
  const work = await mkdtemp(path.join(ROOT, ".grade", "mcp-"));
  const { mkdir, symlink } = await import("node:fs/promises");
  await mkdir(path.join(work, "src")); await mkdir(path.join(work, "test"));
  await writeFile(path.join(work, "wrangler.jsonc"), '{ "name": "t", "main": "src/index.ts", "compatibility_date": "2026-11-01" }');
  await writeFile(path.join(work, "vitest.config.ts"), 'import { cloudflareTest } from "@cloudflare/vitest-plugin";\nimport { defineConfig } from "vitest/config";\nexport default defineConfig({ plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })] });\n');
  await writeFile(path.join(work, "src", "index.ts"), 'export default { async fetch() { return new Response("hi"); } };');
  await writeFile(path.join(work, "test", "a.test.ts"), 'import { exports } from "cloudflare:workers";\nimport { it, expect } from "vitest";\nit("says hi", async () => { expect(await (await exports.default.fetch("http://x/")).text()).toBe("hi"); });\nit("is wrong on purpose", async () => { expect(1).toBe(2); });\n');
  const r = await runTests(work);
  expect(r.passed).toBe(false);
  expect(r.text).toMatch(/1 passed/);
  expect(r.text).toMatch(/1 failed/);
});

describe("report", () => {
  const base = { durationMs: 10_000, costUsd: 0, inputTokens: 0, outputTokens: 0, docSearches: 0, testRuns: 0, blockedCommands: 0, cases: [] };
  const attempts = [
    { ...base, task: "a", model: "m1", condition: "none" as const, passed: 3, total: 3, solved: true },
    { ...base, task: "b", model: "m1", condition: "none" as const, passed: 1, total: 4, solved: false },
    { ...base, task: "a", model: "m1", condition: "docs" as const, passed: 3, total: 3, solved: true, docSearches: 2 },
    { ...base, task: "b", model: "m1", condition: "docs" as const, passed: 0, total: 0, solved: false, error: "did not load" },
  ];
  it("summarizes per model and condition", () => {
    const rows = summarize(attempts);
    expect(rows.map((r) => [r.condition, r.solved, r.testsPassed, r.errors])).toEqual([["none", 1, 4, 0], ["docs", 1, 3, 1]]);
  });
  it("counts a task that didn't load against its real test total", () => {
    const md = markdown("t", attempts, new Map([["a", 3], ["b", 4]]));
    expect(md).toContain("| m1 | Cloudflare docs search | 1/2 | 3/7 |");
    expect(md).toContain("| b | ✗ 1/4 | ✗ 0/4 |");
  });
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

it("pool caps concurrency and keeps order", async () => {
  let live = 0, peak = 0;
  const out = await pool([5, 1, 4, 2, 3], 2, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, n * 5));
    live--;
    return n * 10;
  });
  expect(out).toEqual([50, 10, 40, 20, 30]);
  expect(peak).toBe(2);
});
