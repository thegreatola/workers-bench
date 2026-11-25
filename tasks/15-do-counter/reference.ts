import { DurableObject } from "cloudflare:workers";
interface Env { COUNTER: DurableObjectNamespace<Counter> }
export class Counter extends DurableObject<Env> {
  async value(): Promise<number> { return (await this.ctx.storage.get<number>("value")) ?? 0; }
  async add(by: number): Promise<number> { const v = (await this.value()) + by; await this.ctx.storage.put("value", v); return v; }
  async reset(): Promise<number> { await this.ctx.storage.put("value", 0); return 0; }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/counter\/([^/]+)(?:\/(increment|reset))?$/);
    if (!m) return Response.json({ error: "not found" }, { status: 404 });
    const name = decodeURIComponent(m[1]);
    const stub = env.COUNTER.get(env.COUNTER.idFromName(name));
    if (!m[2] && req.method === "GET") return Response.json({ name, value: await stub.value() });
    if (m[2] === "increment" && req.method === "POST") {
      const by = url.searchParams.get("by");
      if (by !== null && !/^-?\d+$/.test(by)) return Response.json({ error: "by must be a whole number" }, { status: 400 });
      return Response.json({ name, value: await stub.add(by === null ? 1 : Number(by)) });
    }
    if (m[2] === "reset" && req.method === "POST") return Response.json({ name, value: await stub.reset() });
    return Response.json({ error: "not found" }, { status: 404 });
  },
};
