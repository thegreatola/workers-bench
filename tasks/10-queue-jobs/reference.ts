interface Env { JOBS: Queue; RESULTS: KVNamespace }
interface Job { id: string; n: number }
const valid = (b: any): b is Job => typeof b?.id === "string" && b.id.length > 0 && Number.isInteger(b?.n) && b.n >= 0;
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/jobs") return new Response("not found", { status: 404 });
    let b: any;
    try { b = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    if (!valid(b)) return Response.json({ error: "invalid job" }, { status: 400 });
    await env.JOBS.send({ id: b.id, n: b.n });
    return Response.json({ queued: b.id }, { status: 202 });
  },
  async queue(batch: MessageBatch<Job>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { id, n } = msg.body;
      if (n < 0) { msg.retry(); continue; }
      await env.RESULTS.put(`job:${id}`, JSON.stringify({ id, square: n * n }));
      msg.ack();
    }
  },
};
