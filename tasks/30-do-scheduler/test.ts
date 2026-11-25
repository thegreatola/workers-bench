import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const NS = (env as any).SCHEDULER as DurableObjectNamespace;
const stub = (n: string) => NS.get(NS.idFromName(n));
const add = async (n: string, message: string, delaySeconds: number) => {
  const r = await exports.default.fetch(new Request(`http://w.test/schedule/${n}`, { method: "POST", body: JSON.stringify({ message, delaySeconds }), headers: { "content-type": "application/json" } }));
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string; dueAt: number };
};
const state = async (n: string) => (await (await exports.default.fetch(new Request(`http://w.test/schedule/${n}`))).json()) as any;
const alarm = (n: string) => runInDurableObject(stub(n), (_i: unknown, s: DurableObjectState) => s.storage.getAlarm());
/** Reminders due now fire on their own; wait until `n` have been delivered. */
async function delivered(name: string, n: number) {
  for (let i = 0; i < 60; i++) { const s = await state(name); if (s.delivered.length >= n) return s; await new Promise((r) => setTimeout(r, 50)); }
  return state(name);
}

it("one alarm serves many reminders", async () => {
  const b = await add("s1", "b", 3600);
  expect(await alarm("s1")).toBe(b.dueAt);
  const a = await add("s1", "a", 0);
  const c = await add("s1", "c", 0);
  expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  const s = await delivered("s1", 2);
  expect(s.delivered).toEqual(["a", "c"]);
  expect(s.pending).toEqual([{ id: b.id, message: "b", dueAt: b.dueAt }]);
  expect(await alarm("s1")).toBe(b.dueAt);
});
it("an earlier reminder moves the alarm forward", async () => {
  const late = await add("s2", "late", 7200);
  expect(await alarm("s2")).toBe(late.dueAt);
  const soon = await add("s2", "soon", 1800);
  expect(await alarm("s2")).toBe(soon.dueAt);
  expect((await state("s2")).pending.map((p: any) => p.message)).toEqual(["soon", "late"]);
});
it("an early alarm delivers nothing and keeps the alarm", async () => {
  const x = await add("s3", "x", 600);
  expect(await runDurableObjectAlarm(stub("s3"))).toBe(true);
  const s = await state("s3");
  expect(s.delivered).toEqual([]);
  expect(s.pending.map((p: any) => p.message)).toEqual(["x"]);
  expect(await alarm("s3")).toBe(x.dueAt);
});
it("no alarm once everything is delivered", async () => {
  await add("s4", "only", 0);
  expect((await delivered("s4", 1)).delivered).toEqual(["only"]);
  expect(await alarm("s4")).toBeNull();
});
it("validation", async () => {
  for (const b of [{}, { message: "", delaySeconds: 1 }, { message: "x", delaySeconds: -1 }, { message: "x", delaySeconds: 2.5 }, { message: "x", delaySeconds: 86401 }]) {
    const r = await exports.default.fetch(new Request("http://w.test/schedule/v", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } }));
    expect(r.status, JSON.stringify(b)).toBe(400);
  }
  expect(await state("v")).toEqual({ pending: [], delivered: [] });
});
