import { env, exports } from "cloudflare:workers";
import { introspectWorkflowInstance } from "cloudflare:test";
import { it, expect } from "vitest";
const ORDERS = (env as any).ORDERS as Workflow;
const post = (body: unknown) => exports.default.fetch(new Request("http://w.test/orders", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

it("runs charge, cool-off and ship", async () => {
  await using inst = await introspectWorkflowInstance(ORDERS, "o-1");
  await inst.modify(async (m) => { await m.disableSleeps([{ name: "cool-off" }]); });
  const r = await post({ orderId: "o-1", amount: 25 });
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ id: "o-1" });
  expect(await inst.waitForStepResult({ name: "charge" })).toEqual({ charged: 25 });
  expect(await inst.waitForStepResult({ name: "ship" })).toEqual({ shipped: true });
  await inst.waitForStatus("complete");
  expect(await inst.getOutput()).toEqual({ orderId: "o-1", charged: 25, shipped: true });
  const s = await exports.default.fetch(new Request("http://w.test/orders/o-1"));
  expect(s.status).toBe(200);
  expect(await s.json()).toEqual({ id: "o-1", status: "complete" });
});
it("charge survives two failures", async () => {
  await using inst = await introspectWorkflowInstance(ORDERS, "o-2");
  await inst.modify(async (m) => {
    await m.disableSleeps();
    await m.mockStepError({ name: "charge" }, new Error("card declined"), 2);
  });
  await post({ orderId: "o-2", amount: 7 });
  await inst.waitForStatus("complete");
  expect(await inst.getOutput()).toEqual({ orderId: "o-2", charged: 7, shipped: true });
}, 30000);
it("unknown order is 404", async () => {
  expect((await exports.default.fetch(new Request("http://w.test/orders/never"))).status).toBe(404);
});
it("validation", async () => {
  for (const b of [{}, { orderId: "", amount: 5 }, { orderId: "x", amount: 0 }, { orderId: "x", amount: "5" }, { orderId: 3, amount: 5 }]) {
    expect((await post(b)).status, JSON.stringify(b)).toBe(400);
  }
});
