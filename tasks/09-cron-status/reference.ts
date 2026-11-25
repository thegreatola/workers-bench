interface Env { STATE: KVNamespace }
export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const runs = Number((await env.STATE.get("runs")) ?? 0);
    await env.STATE.put("last-run", new Date(controller.scheduledTime).toISOString());
    await env.STATE.put("runs", String(runs + 1));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname !== "/status") return new Response("not found", { status: 404 });
    return Response.json({ lastRun: await env.STATE.get("last-run"), runs: Number((await env.STATE.get("runs")) ?? 0) });
  },
};
