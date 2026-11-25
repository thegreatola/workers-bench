import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const R = (env as any).REMINDERS as DurableObjectNamespace;
const stub = (n: string) => R.get(R.idFromName(n));
const f = (path: string, body?: unknown) => exports.default.fetch(new Request("http://w.test" + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const alarmAt = (n: string) => runInDurableObject(stub(n), (_i: unknown, s: DurableObjectState) => s.storage.getAlarm());
/** Run the alarm once it is really due: a handler may rightly refuse to deliver early. */
async function fire(n: string) {
  const at = await alarmAt(n);
  if (at !== null) await new Promise((r) => setTimeout(r, Math.max(0, at - Date.now()) + 50));
  return runDurableObjectAlarm(stub(n));
}
/** Wait for the state to show what the alarm delivered (it may also fire on its own once due). */
async function settled(n: string, want: unknown) {
  let last: unknown;
  for (let i = 0; i < 40; i++) { last = await (await f(`/reminders/${n}`)).json(); if (JSON.stringify(last) === JSON.stringify(want)) break; await new Promise((r) => setTimeout(r, 50)); }
  return last;
}

it("schedules an alarm and delivers on it", async () => {
  const before = Date.now();
  const r = await f("/reminders/tea", { message: "tea is ready", delaySeconds: 1 });
  expect(r.status).toBe(201);
  const { scheduledFor } = (await r.json()) as any;
  expect(scheduledFor).toBeGreaterThanOrEqual(before + 1000);
  expect(scheduledFor).toBeLessThanOrEqual(Date.now() + 1000);
  expect(await alarmAt("tea")).toBe(scheduledFor);
  expect(await (await f("/reminders/tea")).json()).toEqual({ pending: "tea is ready", delivered: [] });
  await fire("tea");
  expect(await settled("tea", { pending: null, delivered: ["tea is ready"] })).toEqual({ pending: null, delivered: ["tea is ready"] });
  expect(await alarmAt("tea")).toBeNull();
});
it("delivered messages build up in order", async () => {
  for (const m of ["one", "two", "three"]) {
    await f("/reminders/seq", { message: m, delaySeconds: 1 });
    await fire("seq");
    for (let i = 0; i < 40 && ((await (await f("/reminders/seq")).json()) as any).pending !== null; i++) await new Promise((r) => setTimeout(r, 50));
  }
  expect(await settled("seq", { pending: null, delivered: ["one", "two", "three"] })).toEqual({ pending: null, delivered: ["one", "two", "three"] });
}, 15000);
it("a new reminder replaces the pending one", async () => {
  await f("/reminders/swap", { message: "old", delaySeconds: 100 });
  await f("/reminders/swap", { message: "new", delaySeconds: 1 });
  expect(await (await f("/reminders/swap")).json()).toEqual({ pending: "new", delivered: [] });
  expect(await alarmAt("swap")).toBeLessThanOrEqual(Date.now() + 1000);
  await fire("swap");
  expect(await settled("swap", { pending: null, delivered: ["new"] })).toEqual({ pending: null, delivered: ["new"] });
});
it("validation", async () => {
  for (const b of [{}, { message: "", delaySeconds: 5 }, { message: "x", delaySeconds: 0 }, { message: "x", delaySeconds: 1.5 }, { message: "x", delaySeconds: 86401 }, { message: 3, delaySeconds: 5 }]) {
    expect((await f("/reminders/bad", b)).status, JSON.stringify(b)).toBe(400);
  }
  expect(await alarmAt("bad")).toBeNull();
});
it("a new name is empty", async () => {
  expect(await (await f("/reminders/nobody")).json()).toEqual({ pending: null, delivered: [] });
});
