/**
 * Turns a run's results.json into tables.
 *
 *   npm run report -- <run id>
 *
 * Writes runs/<run id>/report.md: a leaderboard (one row per model and
 * condition) and a task-by-task grid.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Attempt, Condition } from "./bench.js";
import { CONDITIONS } from "./bench.js";
import { ROOT } from "./grade.js";

export interface Row {
  model: string;
  condition: Condition;
  solved: number;
  tasks: number;
  testsPassed: number;
  tests: number;
  medianSeconds: number;
  docSearches: number;
  testRuns: number;
  errors: number;
}

export function summarize(attempts: Attempt[]): Row[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = `${a.model}\0${a.condition}`;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const rows = [...groups.values()].map((as): Row => ({
    model: as[0].model,
    condition: as[0].condition,
    solved: as.filter((a) => a.solved).length,
    tasks: as.length,
    testsPassed: as.reduce((n, a) => n + a.passed, 0),
    tests: as.reduce((n, a) => n + a.total, 0),
    medianSeconds: median(as.map((a) => a.durationMs / 1000)),
    docSearches: as.reduce((n, a) => n + a.docSearches, 0),
    testRuns: as.reduce((n, a) => n + (a.testRuns ?? 0), 0),
    errors: as.filter((a) => a.agentError || a.error).length,
  }));
  return rows.sort((a, b) => b.solved - a.solved || b.testsPassed - a.testsPassed || a.model.localeCompare(b.model) || a.condition.localeCompare(b.condition));
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function markdown(id: string, attempts: Attempt[], totals: Map<string, number>): string {
  const rows = summarize(attempts);
  const lines = [
    `# workers-bench run ${id}`,
    "",
    "| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches | Test runs |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      // An attempt whose code never loaded reports 0 tests, so count against the task's real total.
      const tests = attempts.filter((a) => a.model === r.model && a.condition === r.condition).reduce((n, a) => n + (totals.get(a.task) ?? a.total), 0);
      return `| ${r.model} | ${CONDITIONS[r.condition].label} | ${r.solved}/${r.tasks} | ${r.testsPassed}/${tests} | ${r.medianSeconds.toFixed(0)} s | ${CONDITIONS[r.condition].docs ? r.docSearches : "–"} | ${CONDITIONS[r.condition].run ? r.testRuns : "–"} |`;
    }),
    "",
    "## By task",
    "",
  ];
  const cols = rows.map((r) => [r.model, r.condition] as const);
  lines.push(`| Task | ${cols.map(([m, c]) => `${m}, ${c}`).join(" | ")} |`);
  lines.push(`|---|${cols.map(() => "---").join("|")}|`);
  for (const task of [...new Set(attempts.map((a) => a.task))].sort()) {
    const cells = cols.map(([m, c]) => {
      const a = attempts.find((x) => x.task === task && x.model === m && x.condition === c);
      if (!a) return " ";
      const total = totals.get(task) ?? a.total;
      return a.solved ? `✓ ${a.passed}/${total}` : `✗ ${a.passed}/${total}`;
    });
    lines.push(`| ${task} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) throw new Error("usage: npm run report -- <run id>");
  const dir = path.join(ROOT, "runs", id);
  const { attempts } = JSON.parse(await readFile(path.join(dir, "results.json"), "utf8")) as { attempts: Attempt[] };
  const totals = new Map<string, number>();
  for (const a of attempts) totals.set(a.task, Math.max(totals.get(a.task) ?? 0, a.total));
  const md = markdown(id, attempts, totals);
  await writeFile(path.join(dir, "report.md"), md);
  console.log(md);
}
