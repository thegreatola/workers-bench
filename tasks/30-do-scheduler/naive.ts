import { DurableObject } from "cloudflare:workers";
interface Env { SCHEDULER: DurableObjectNamespace<Scheduler> }
export class Scheduler extends DurableObject<Env> {
  async add(message: string, delaySeconds: number) {
    const dueAt = Date.now() + delaySeconds * 1000;
    const p = ((await this.ctx.storage.get<any[]>("p")) ?? []);
    const item = { id: crypto.randomUUID(), message, dueAt };
    p.push(item); p.sort((a, b) => a.dueAt - b.dueAt);
    await this.ctx.storage.put("p", p);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(dueAt);
    return { id: item.id, dueAt };
  }
  async state() { return { pending: (await this.ctx.storage.get<any[]>("p")) ?? [], delivered: (await this.ctx.storage.get<string[]>("d")) ?? [] }; }
  async alarm() {
    const p = (await this.ctx.storage.get<any[]>("p")) ?? [];
    const d = (await this.ctx.storage.get<string[]>("d")) ?? [];
    const first = p.shift();
    if (first) d.push(first.message);
    await this.ctx.storage.put({ p, d });
    if (p.length) await this.ctx.storage.setAlarm(p[0].dueAt);
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/schedule\/([^/]+)$/)!;
    const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName(m[1]));
    if (req.method === "GET") return Response.json(await stub.state());
    const b: any = await req.json();
    if (typeof b?.message !== "string" || !b.message || !Number.isInteger(b?.delaySeconds) || b.delaySeconds < 0 || b.delaySeconds > 86400) return Response.json({}, { status: 400 });
    return Response.json(await stub.add(b.message, b.delaySeconds), { status: 201 });
  },
};
