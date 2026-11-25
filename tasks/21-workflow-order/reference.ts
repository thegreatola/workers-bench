import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
interface Env { ORDERS: Workflow }
interface Params { orderId: string; amount: number }
export class OrderWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { orderId, amount } = event.payload;
    const c = await step.do("charge", { retries: { limit: 3, delay: "1 second", backoff: "exponential" } }, async () => ({ charged: amount }));
    await step.sleep("cool-off", "1 hour");
    const s = await step.do("ship", async () => ({ shipped: true }));
    return { orderId, charged: c.charged, shipped: s.shipped };
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === "POST" && pathname === "/orders") {
      let b: any;
      try { b = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
      if (typeof b?.orderId !== "string" || !b.orderId || typeof b?.amount !== "number" || !(b.amount > 0)) return Response.json({ error: "invalid order" }, { status: 400 });
      await env.ORDERS.create({ id: b.orderId, params: { orderId: b.orderId, amount: b.amount } });
      return Response.json({ id: b.orderId }, { status: 202 });
    }
    const m = pathname.match(/^\/orders\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const id = decodeURIComponent(m[1]);
      try {
        const inst = await env.ORDERS.get(id);
        return Response.json({ id, status: (await inst.status()).status });
      } catch { return Response.json({ error: "not found" }, { status: 404 }); }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  },
};
