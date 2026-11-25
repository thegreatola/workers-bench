interface Env { DB: D1Database }
const j = (b: unknown, status = 200) => Response.json(b, { status });
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/transfers") return j({ error: "not found" }, 404);
    let b: any;
    try { b = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
    const { from, to, amount } = b ?? {};
    if (typeof from !== "string" || typeof to !== "string" || !from || !to || from === to || !Number.isInteger(amount) || amount <= 0) return j({ error: "invalid transfer" }, 400);
    // One statement, so it is atomic: both rows change or neither does.
    const r = await env.DB.prepare(
      `UPDATE accounts SET balance = balance + CASE WHEN id = ?2 THEN ?3 ELSE -?3 END
       WHERE id IN (?1, ?2)
         AND (SELECT COUNT(*) FROM accounts WHERE id IN (?1, ?2)) = 2
         AND (SELECT balance FROM accounts WHERE id = ?1) >= ?3`,
    ).bind(from, to, amount).run();
    const rows = (await env.DB.prepare("SELECT id, balance FROM accounts WHERE id IN (?1, ?2)").bind(from, to).all<{ id: string; balance: number }>()).results;
    const a = rows.find((x) => x.id === from), c = rows.find((x) => x.id === to);
    if (r.meta.changes !== 2) {
      if (!a || !c) return j({ error: "account not found" }, 404);
      return j({ error: "insufficient funds" }, 409);
    }
    return j({ from: a, to: c });
  },
};
