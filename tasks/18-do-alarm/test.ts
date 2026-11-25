import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const R = (env as any).REMINDERS as DurableObjectNamespace;
const stub = (n: string) => R.get(R.idFromName(n));
const f = (path: string, body?: unknown) => exports.default.fetch(new Request("http://w.test" + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const alarmAt = (n: string) => runInDurableObject(stub(n), (_i: unknown, s: DurableObjectState) => s.storage.getAlarm());

it("schedules an alarm and delivers on it", async () => {
  const before = Date.now();
  const r = await f("/reminders/tea", { message: "tea is ready", delaySeconds: 300 });
  expect(r.status).toBe(201);
  const { scheduledFor } = (await r.json()) as any;
  expect(scheduledFor).toBeGreaterThanOrEqual(before + 299_000);
  expect(scheduledFor).toBeLessThanOrEqual(Date.now() + 301_000);
  expect(await alarmAt("tea")).toBe(scheduledFor);
  expect(await (await f("/reminders/tea")).json()).toEqual({ pending: "tea is ready", delivered: [] });
  expect(await runDurableObjectAlarm(stub("tea"))).toBe(true);
  expect(await (await f("/reminders/tea")).json()).toEqual({ pending: null, delivered: ["tea is ready"] });
  expect(await runDurableObjectAlarm(stub("tea"))).toBe(false);
});
it("delivered messages build up in order", async () => {
  for (const m of ["one", "two", "three"]) {
    await f("/reminders/seq", { message: m, delaySeconds: 10 });
    await runDurableObjectAlarm(stub("seq"));
  }
  expect(await (await f("/reminders/seq")).json()).toEqual({ pending: null, delivered: ["one", "two", "three"] });
});
it("a new reminder replaces the pending one", async () => {
  await f("/reminders/swap", { message: "old", delaySeconds: 100 });
  await f("/reminders/swap", { message: "new", delaySeconds: 50 });
  expect(await (await f("/reminders/swap")).json()).toEqual({ pending: "new", delivered: [] });
  const at = await alarmAt("swap");
  expect(at).toBeLessThanOrEqual(Date.now() + 51_000);
  await runDurableObjectAlarm(stub("swap"));
  expect(await (await f("/reminders/swap")).json()).toEqual({ pending: null, delivered: ["new"] });
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
