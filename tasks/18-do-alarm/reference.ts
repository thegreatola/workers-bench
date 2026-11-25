import { DurableObject } from "cloudflare:workers";
interface Env { REMINDERS: DurableObjectNamespace<Reminder> }
export class Reminder extends DurableObject<Env> {
  async schedule(message: string, delaySeconds: number): Promise<number> {
    const at = Date.now() + delaySeconds * 1000;
    await this.ctx.storage.put("pending", message);
    await this.ctx.storage.setAlarm(at);
    return at;
  }
  async state() {
    return { pending: (await this.ctx.storage.get<string>("pending")) ?? null, delivered: (await this.ctx.storage.get<string[]>("delivered")) ?? [] };
  }
  async alarm(): Promise<void> {
    const pending = await this.ctx.storage.get<string>("pending");
    if (pending === undefined) return;
    const delivered = (await this.ctx.storage.get<string[]>("delivered")) ?? [];
    delivered.push(pending);
    await this.ctx.storage.put("delivered", delivered);
    await this.ctx.storage.delete("pending");
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/reminders\/([^/]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const stub = env.REMINDERS.get(env.REMINDERS.idFromName(decodeURIComponent(m[1])));
    if (req.method === "GET") return Response.json(await stub.state());
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    let b: any;
    try { b = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    if (typeof b?.message !== "string" || !b.message || !Number.isInteger(b?.delaySeconds) || b.delaySeconds < 1 || b.delaySeconds > 86400)
      return Response.json({ error: "invalid reminder" }, { status: 400 });
    return Response.json({ scheduledFor: await stub.schedule(b.message, b.delaySeconds) }, { status: 201 });
  },
};
