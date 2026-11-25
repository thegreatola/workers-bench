interface Env { DB: D1Database }
let ready = false;
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const key = req.headers.get("Idempotency-Key");
    const b: any = await req.json();
    if (!key || !Number.isInteger(b?.amount) || b.amount <= 0 || (b?.currency !== "USD" && b?.currency !== "EUR")) return Response.json({ error: "bad" }, { status: 400 });
    if (!ready) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS ik (key TEXT PRIMARY KEY, body TEXT, resp TEXT)").run(); ready = true; }
    const seen = await env.DB.prepare("SELECT body, resp FROM ik WHERE key = ?").bind(key).first<{ body: string; resp: string }>();
    const body = JSON.stringify(b);
    if (seen) return seen.body === body ? new Response(seen.resp, { status: 201, headers: { "content-type": "application/json" } }) : Response.json({ error: "idempotency key reused" }, { status: 422 });
    const p = await env.DB.prepare("INSERT INTO payments (amount, currency) VALUES (?, ?) RETURNING id, amount, currency").bind(b.amount, b.currency).first();
    const resp = JSON.stringify(p);
    await env.DB.prepare("INSERT OR REPLACE INTO ik (key, body, resp) VALUES (?, ?, ?)").bind(key, body, resp).run();
    return new Response(resp, { status: 201, headers: { "content-type": "application/json" } });
  },
};
