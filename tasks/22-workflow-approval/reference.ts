import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
interface Env { EXPENSES: Workflow }
interface Params { expenseId: string; amount: number }
interface Decision { approved: boolean; by: string }
export class ExpenseWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    await step.do("record", async () => ({ recorded: true }));
    let d: Decision;
    try {
      const e = await step.waitForEvent<Decision>("approval", { type: "decision", timeout: "1 day" });
      d = e.payload;
    } catch {
      return { status: "expired" };
    }
    if (!d.approved) return { status: "rejected", by: d.by };
    await step.do("pay", async () => ({ paid: event.payload.amount }));
    return { status: "paid", by: d.by };
  }
}
const bad = () => Response.json({ error: "invalid input" }, { status: 400 });
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method !== "POST") return new Response("not found", { status: 404 });
    let b: any;
    try { b = await req.json(); } catch { return bad(); }
    if (pathname === "/expenses") {
      if (typeof b?.expenseId !== "string" || !b.expenseId || typeof b?.amount !== "number" || !(b.amount > 0)) return bad();
      await env.EXPENSES.create({ id: b.expenseId, params: { expenseId: b.expenseId, amount: b.amount } });
      return Response.json({ id: b.expenseId }, { status: 202 });
    }
    const m = pathname.match(/^\/expenses\/([^/]+)\/decision$/);
    if (m) {
      if (typeof b?.approved !== "boolean" || typeof b?.by !== "string" || !b.by) return bad();
      const inst = await env.EXPENSES.get(decodeURIComponent(m[1]));
      await inst.sendEvent({ type: "decision", payload: { approved: b.approved, by: b.by } });
      return Response.json({ sent: true }, { status: 202 });
    }
    return new Response("not found", { status: 404 });
  },
};
