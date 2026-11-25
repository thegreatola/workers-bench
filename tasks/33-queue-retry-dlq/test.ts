import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/index";
const SENT = (env as any).SENT as KVNamespace, DEAD = (env as any).DEAD as KVNamespace;
const msg = (id: string, attempts: number, body: unknown) => ({ id, timestamp: new Date(), attempts, body });
/** A batch whose ack and retry calls are recorded, delays included. */
async function run(queue: string, messages: ReturnType<typeof msg>[]) {
  const r = { ackAll: false, retryAll: false, acks: [] as string[], retries: [] as { msgId: string; delaySeconds?: number }[] };
  const batch = {
    queue,
    messages: messages.map((m) => ({ ...m, ack: () => r.acks.push(m.id), retry: (o?: { delaySeconds?: number }) => r.retries.push({ msgId: m.id, delaySeconds: o?.delaySeconds }) })),
    ackAll: () => { r.ackAll = true; },
    retryAll: () => { r.retryAll = true; },
  };
  const ctx = createExecutionContext();
  await (worker as any).queue(batch, env, ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
async function poll(kv: KVNamespace, key: string) {
  for (let i = 0; i < 50; i++) { const v = await kv.get(key); if (v !== null) return v; await new Promise((r) => setTimeout(r, 100)); }
  return null;
}

it("sends, retries with backoff, and acks each message on its own", async () => {
  const r = await run("emails", [
    msg("m1", 1, { to: "ann@ok.test", subject: "hi" }),
    msg("m2", 1, { to: "bo@bounce.test", subject: "a" }),
    msg("m3", 2, { to: "cy@bounce.test", subject: "b" }),
    msg("m4", 1, { to: "dee@ok.test", subject: "yo" }),
  ]);
  expect(r.ackAll).toBe(false);
  expect(r.retryAll).toBe(false);
  expect([...r.acks].sort()).toEqual(["m1", "m4"]);
  expect([...r.retries].sort((a, b) => a.msgId.localeCompare(b.msgId))).toEqual([{ msgId: "m2", delaySeconds: 30 }, { msgId: "m3", delaySeconds: 60 }]);
  expect(await SENT.get("sent:m1")).toBe("ann@ok.test");
  expect(await SENT.get("sent:m4")).toBe("dee@ok.test");
  expect(await SENT.get("sent:m2")).toBeNull();
});
it("dead-letters a bounce on the third attempt and a bad address at once", async () => {
  const r = await run("emails", [
    msg("m5", 3, { to: "eli@bounce.test", subject: "last try" }),
    msg("m6", 1, { to: "no-at-sign", subject: "oops" }),
  ]);
  expect([...r.acks].sort()).toEqual(["m5", "m6"]);
  expect(r.retries).toEqual([]);
  expect(JSON.parse((await poll(DEAD, "dead:eli@bounce.test"))!)).toEqual({ to: "eli@bounce.test", subject: "last try", error: "bounced" });
  expect(JSON.parse((await poll(DEAD, "dead:no-at-sign"))!)).toEqual({ to: "no-at-sign", subject: "oops", error: "invalid address" });
}, 20000);
it("the dead-letter consumer stores what it gets", async () => {
  const r = await run("emails-dlq", [msg("d1", 1, { to: "zed@x.test", subject: "s", error: "bounced" })]);
  expect(r.acks.includes("d1") || r.ackAll).toBe(true);
  expect(JSON.parse((await DEAD.get("dead:zed@x.test"))!)).toEqual({ to: "zed@x.test", subject: "s", error: "bounced" });
  expect(await SENT.get("sent:d1")).toBeNull();
});
