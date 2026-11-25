import { DurableObject } from "cloudflare:workers";
interface Env { SCHEDULER: DurableObjectNamespace<Scheduler> }
interface Item { id: string; message: string; dueAt: number; seq: number }
export class Scheduler extends DurableObject<Env> {
  async pending(): Promise<Item[]> { return (await this.ctx.storage.get<Item[]>("pending")) ?? []; }
  async rearm(items: Item[]): Promise<void> {
    if (items.length) await this.ctx.storage.setAlarm(items[0].dueAt);
    else await this.ctx.storage.deleteAlarm();
  }
  async add(message: string, delaySeconds: number): Promise<{ id: string; dueAt: number }> {
    const seq = ((await this.ctx.storage.get<number>("seq")) ?? 0) + 1;
    const item: Item = { id: crypto.randomUUID(), message, dueAt: Date.now() + delaySeconds * 1000, seq };
    const items = [...(await this.pending()), item].sort((a, b) => a.dueAt - b.dueAt || a.seq - b.seq);
    await this.ctx.storage.put({ pending: items, seq });
    await this.rearm(items);
    return { id: item.id, dueAt: item.dueAt };
  }
  async state() {
    return { pending: (await this.pending()).map(({ id, message, dueAt }) => ({ id, message, dueAt })), delivered: (await this.ctx.storage.get<string[]>("delivered")) ?? [] };
  }
  async alarm(): Promise<void> {
    const now = Date.now();
    const items = await this.pending();
    const due = items.filter((i) => i.dueAt <= now);
    const rest = items.filter((i) => i.dueAt > now);
    const delivered = [...((await this.ctx.storage.get<string[]>("delivered")) ?? []), ...due.map((i) => i.message)];
    await this.ctx.storage.put({ pending: rest, delivered });
    await this.rearm(rest);
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/schedule\/([^/]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName(decodeURIComponent(m[1])));
    if (req.method === "GET") return Response.json(await stub.state());
    let b: any;
    try { b = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    if (typeof b?.message !== "string" || !b.message || !Number.isInteger(b?.delaySeconds) || b.delaySeconds < 0 || b.delaySeconds > 86400) return Response.json({ error: "invalid" }, { status: 400 });
    return Response.json(await stub.add(b.message, b.delaySeconds), { status: 201 });
  },
};
