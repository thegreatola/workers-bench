/**
 * Grades one Worker against a task's hidden tests, inside workerd (Cloudflare's
 * runtime) through the Workers Vitest plugin. Nothing is deployed.
 *
 * A grading folder is laid out like a small Worker project:
 *   wrangler.jsonc       the task's bindings
 *   src/index.ts         the code under test
 *   test/index.test.ts   the task's hidden tests
 *   vitest.config.ts
 * It lives inside this repo so the plugin resolves from node_modules.
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const TASKS = path.join(ROOT, "tasks");

const VITEST_CONFIG = `import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { testTimeout: 20000 },
});
`;

export interface TestCase { name: string; passed: boolean; message?: string }
export interface Grade {
  task: string;
  passed: number;
  total: number;
  /** All tests passed. */
  solved: boolean;
  cases: TestCase[];
  /** Set when the tests could not run at all, e.g. the code did not build. */
  error?: string;
}

export async function grade(task: string, code: string, dir: string, timeoutMs = 120_000): Promise<Grade> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "test"), { recursive: true });
  await cp(path.join(TASKS, task, "wrangler.jsonc"), path.join(dir, "wrangler.jsonc"));
  await cp(path.join(TASKS, task, "test.ts"), path.join(dir, "test", "index.test.ts"));
  await writeFile(path.join(dir, "src", "index.ts"), code);
  await writeFile(path.join(dir, "vitest.config.ts"), VITEST_CONFIG);

  const out = path.join(dir, "result.json");
  const { stdout, stderr } = await run(path.join(ROOT, "node_modules", ".bin", "vitest"), ["run", "--reporter=json", `--outputFile=${out}`], dir, timeoutMs);
  let report: any;
  try {
    report = JSON.parse(await readFile(out, "utf8"));
  } catch {
    return { task, passed: 0, total: 0, solved: false, cases: [], error: tail(stderr || stdout) };
  }
  const cases: TestCase[] = [];
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      cases.push({ name: a.title, passed: a.status === "passed", message: a.status === "passed" ? undefined : firstLine(a.failureMessages?.[0]) });
    }
  }
  const total = report.numTotalTests ?? cases.length;
  const passed = report.numPassedTests ?? cases.filter((c) => c.passed).length;
  // A file that fails to load (syntax error, missing export) reports 0 tests.
  const fileError = (report.testResults ?? []).map((f: any) => f.message).find((m: string) => m);
  if (total === 0) return { task, passed: 0, total: 0, solved: false, cases, error: firstLine(fileError) ?? tail(stderr || stdout) };
  return { task, passed, total, solved: passed === total, cases };
}

function firstLine(s?: string): string | undefined {
  return s?.split("\n").find((l) => l.trim())?.trim().slice(0, 300);
}
function tail(s: string): string {
  return s.trim().split("\n").slice(-6).join("\n").slice(0, 800);
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", NO_COLOR: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { child.kill("SIGKILL"); stderr += `\ngrading timed out after ${timeoutMs / 1000}s`; }, timeoutMs);
    child.on("close", () => { clearTimeout(timer); resolve({ stdout, stderr }); });
  });
}
