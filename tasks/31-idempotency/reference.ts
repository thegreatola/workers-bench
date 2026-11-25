interface Env { DB: D1Database }
const j = (b: unknown, status: number) => Response.json(b, { status });
const SCHEMA = "CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, request TEXT NOT NULL, payment_id INTEGER)";
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/payments") return j({ error: "not found" }, 404);
    const key = req.headers.get("Idempotency-Key");
    let b: any;
    try { b = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
    if (!key || !Number.isInteger(b?.amount) || b.amount <= 0 || (b?.currency !== "USD" && b?.currency !== "EUR")) return j({ error: "invalid request" }, 400);
    const request = JSON.stringify({ amount: b.amount, currency: b.currency });
    await env.DB.prepare(SCHEMA).run();
    // Claim the key and create the payment in one atomic batch. A concurrent duplicate's claim inserts nothing.
    const [claim] = await env.DB.batch([
      env.DB.prepare("INSERT INTO idempotency (key, request) VALUES (?, ?) ON CONFLICT(key) DO NOTHING").bind(key, request),
      env.DB.prepare("INSERT INTO payments (amount, currency) SELECT ?, ? WHERE changes() = 1").bind(b.amount, b.currency),
      env.DB.prepare("UPDATE idempotency SET payment_id = last_insert_rowid() WHERE key = ? AND payment_id IS NULL AND changes() = 1").bind(key),
    ]);
    void claim;
    const row = await env.DB.prepare("SELECT i.request, p.id, p.amount, p.currency FROM idempotency i JOIN payments p ON p.id = i.payment_id WHERE i.key = ?").bind(key).first<{ request: string; id: number; amount: number; currency: string }>();
    if (!row) return j({ error: "conflict, retry" }, 409);
    if (row.request !== request) return j({ error: "idempotency key reused" }, 422);
    return j({ id: row.id, amount: row.amount, currency: row.currency }, 201);
  },
};
