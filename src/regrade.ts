/**
 * Grades a run's saved code again, without calling any model. Use it after a
 * task's tests are fixed, so earlier runs are scored by the same tests.
 *
 *   npm run regrade -- <run id>
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Attempt } from "./bench.js";
import { pool } from "./bench.js";
import { grade, ROOT } from "./grade.js";

const id = process.argv[2];
if (!id) throw new Error("usage: npm run regrade -- <run id>");
const dir = path.join(ROOT, "runs", id);
const file = path.join(dir, "results.json");
const data = JSON.parse(await readFile(file, "utf8")) as { attempts: Attempt[] };
let changed = 0;
data.attempts = await pool(data.attempts, 4, async (a) => {
  const out = path.join(dir, a.condition, a.model, a.task);
  const code = await readFile(path.join(out, "index.ts"), "utf8").catch(() => null);
  if (code === null || a.error === "the agent wrote no code") return a;
  const g = await grade(a.task, code, path.join(ROOT, ".grade", "regrade", id, a.condition, a.model, a.task));
  const next: Attempt = { ...a, ...g };
  if (!g.error) delete next.error;
  if (next.passed !== a.passed || next.total !== a.total) {
    changed++;
    console.log(`${a.model} ${a.condition} ${a.task}: ${a.passed}/${a.total} -> ${next.passed}/${next.total}`);
  }
  await writeFile(path.join(out, "result.json"), JSON.stringify(next, null, 2) + "\n");
  return next;
});
await writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(`${changed} attempt(s) changed score`);
