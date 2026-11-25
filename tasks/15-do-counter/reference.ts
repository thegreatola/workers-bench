import { DurableObject } from "cloudflare:workers";
interface Env { COUNTER: DurableObjectNamespace<Counter> }
export class Counter extends DurableObject<Env> {
  // One synchronous SQL statement per change: atomic, with no await between read and write.
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL)");
  }
  async value(): Promise<number> {
    return this.ctx.storage.sql.exec<{ value: number }>("SELECT value FROM counter WHERE id = 1").toArray()[0]?.value ?? 0;
  }
  async add(by: number): Promise<number> {
    return this.ctx.storage.sql.exec<{ value: number }>("INSERT INTO counter (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = value + excluded.value RETURNING value", by).one().value;
  }
  async reset(): Promise<number> {
    this.ctx.storage.sql.exec("INSERT INTO counter (id, value) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET value = 0");
    return 0;
  }
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
