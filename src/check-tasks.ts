/**
 * Checks the benchmark itself: every task's reference solution must pass all
 * of its tests, and an empty Worker must fail all of them. Run before trusting
 * any score.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { grade, ROOT, TASKS } from "./grade.js";

const EMPTY = `export default { async fetch() { return new Response("not implemented", { status: 501 }); } };\n`;
const only = process.argv.slice(2);
const tasks = (await readdir(TASKS)).filter((t) => !only.length || only.some((o) => t.startsWith(o))).sort();
let bad = 0;
for (const t of tasks) {
  const ref = await readFile(path.join(TASKS, t, "reference.ts"), "utf8");
  const a = await grade(t, ref, path.join(ROOT, ".grade", t, "reference"));
  const b = await grade(t, emptyFor(ref), path.join(ROOT, ".grade", t, "empty"));
  // A naive.ts, where present, is the plausible-but-wrong version the task is built to catch: it must fail.
  const naivePath = path.join(TASKS, t, "naive.ts");
  const naive = await readFile(naivePath, "utf8").catch(() => null);
  const c = naive === null ? null : await grade(t, naive, path.join(ROOT, ".grade", t, "naive"));
  const ok = a.solved && b.passed === 0 && (c === null || !c.solved);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${t}  reference ${a.passed}/${a.total}  empty ${b.passed}/${b.total}${c ? `  naive ${c.passed}/${c.total}` : ""}`);
  if (a.error) console.log("     reference error:", a.error);
  for (const c of a.cases.filter((c) => !c.passed)) console.log(`     reference failed: ${c.name}: ${c.message}`);
  for (const c of b.cases.filter((c) => c.passed)) console.log(`     empty passed: ${c.name}`);
}
console.log(bad ? `\n${bad} task(s) need fixing` : `\nall ${tasks.length} tasks check out`);
process.exit(bad ? 1 : 0);

/** An empty Worker that still exports the reference's class names, so Durable Object bindings load. */
function emptyFor(ref: string): string {
  const classes = [...ref.matchAll(/export class (\w+)/g)].map((m) => m[1]);
  const imp = classes.length ? `import { DurableObject } from "cloudflare:workers";\n` : "";
  return imp + classes.map((c) => `export class ${c} extends DurableObject {}\n`).join("") + EMPTY;
}
