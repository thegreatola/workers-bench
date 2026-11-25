import { env, exports } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/index";
const RESULTS = (env as any).RESULTS as KVNamespace;
const post = (body: unknown) => exports.default.fetch(new Request("http://w.test/jobs", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

it("consumer acks good messages and retries bad ones", async () => {
  const batch = createMessageBatch("jobs", [
    { id: "m1", timestamp: new Date(), attempts: 1, body: { id: "a", n: 3 } },
    { id: "m2", timestamp: new Date(), attempts: 1, body: { id: "b", n: -1 } },
    { id: "m3", timestamp: new Date(), attempts: 1, body: { id: "c", n: 0 } },
  ]);
  const ctx = createExecutionContext();
  await (worker as any).queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);
  expect(result.ackAll).toBe(false);
  expect(result.retryBatch.retry).toBe(false);
  expect([...result.explicitAcks].sort()).toEqual(["m1", "m3"]);
  expect(result.retryMessages.map((m) => m.msgId)).toEqual(["m2"]);
  expect(JSON.parse((await RESULTS.get("job:a"))!)).toEqual({ id: "a", square: 9 });
  expect(JSON.parse((await RESULTS.get("job:c"))!)).toEqual({ id: "c", square: 0 });
  expect(await RESULTS.get("job:b")).toBeNull();
});
it("producer validates", async () => {
  for (const b of [{}, { id: "", n: 1 }, { id: "x", n: 1.5 }, { id: "x", n: -2 }, { id: 3, n: 1 }, { id: "x" }]) {
    expect((await post(b)).status, JSON.stringify(b)).toBe(400);
  }
});
it("a posted job reaches the consumer", async () => {
  const r = await post({ id: "e2e", n: 12 });
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ queued: "e2e" });
  let v: string | null = null;
  for (let i = 0; i < 50 && v === null; i++) { await new Promise((res) => setTimeout(res, 200)); v = await RESULTS.get("job:e2e"); }
  expect(v && JSON.parse(v)).toEqual({ id: "e2e", square: 144 });
}, 20000);
