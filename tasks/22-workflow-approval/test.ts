import { env, exports } from "cloudflare:workers";
import { introspectWorkflowInstance } from "cloudflare:test";
import { it, expect } from "vitest";
const EXPENSES = (env as any).EXPENSES as Workflow;
const post = (path: string, body: unknown) => exports.default.fetch(new Request("http://w.test" + path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

it("approved expenses are paid", async () => {
  await using inst = await introspectWorkflowInstance(EXPENSES, "e-1");
  await inst.modify(async (m) => { await m.mockEvent({ type: "decision", payload: { approved: true, by: "ana" } }); });
  const r = await post("/expenses", { expenseId: "e-1", amount: 40 });
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ id: "e-1" });
  expect(await inst.waitForStepResult({ name: "record" })).toEqual({ recorded: true });
  expect(await inst.waitForStepResult({ name: "pay" })).toEqual({ paid: 40 });
  await inst.waitForStatus("complete");
  expect(await inst.getOutput()).toEqual({ status: "paid", by: "ana" });
});
it("no decision in time means expired, not failed", async () => {
  await using inst = await introspectWorkflowInstance(EXPENSES, "e-2");
  await inst.modify(async (m) => { await m.forceEventTimeout({ name: "approval" }); });
  await post("/expenses", { expenseId: "e-2", amount: 5 });
  await inst.waitForStatus("complete");
  expect(await inst.getOutput()).toEqual({ status: "expired" });
});
it("a decision sent through the API reaches the workflow", async () => {
  await using inst = await introspectWorkflowInstance(EXPENSES, "e-3");
  await post("/expenses", { expenseId: "e-3", amount: 9 });
  await inst.waitForStepResult({ name: "record" });
  const d = await post("/expenses/e-3/decision", { approved: false, by: "raj" });
  expect(d.status).toBe(202);
  await inst.waitForStatus("complete");
  expect(await inst.getOutput()).toEqual({ status: "rejected", by: "raj" });
}, 30000);
it("validation", async () => {
  for (const b of [{}, { expenseId: "", amount: 1 }, { expenseId: "x", amount: -1 }]) expect((await post("/expenses", b)).status, JSON.stringify(b)).toBe(400);
  for (const b of [{}, { approved: "yes", by: "a" }, { approved: true, by: "" }]) expect((await post("/expenses/x/decision", b)).status, JSON.stringify(b)).toBe(400);
});
