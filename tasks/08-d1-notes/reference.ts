interface Env { DB: D1Database }
const j = (b: unknown, status = 200) => Response.json(b, { status });
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/notes" && req.method === "POST") {
      let body: any;
      try { body = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
      if (typeof body?.text !== "string" || !body.text.trim()) return j({ error: "text is required" }, 400);
      const row = await env.DB.prepare("INSERT INTO notes (text) VALUES (?) RETURNING id, text").bind(body.text).first();
      return j(row, 201);
    }
    if (url.pathname === "/notes" && req.method === "GET") {
      const l = url.searchParams.get("limit") ?? "20";
      if (!/^\d+$/.test(l) || +l < 1 || +l > 100) return j({ error: "limit must be 1 to 100" }, 400);
      const { results } = await env.DB.prepare("SELECT id, text FROM notes ORDER BY id ASC LIMIT ?").bind(+l).all();
      return j({ notes: results });
    }
    const m = url.pathname.match(/^\/notes\/(\d+)$/);
    if (m && req.method === "GET") {
      const row = await env.DB.prepare("SELECT id, text FROM notes WHERE id = ?").bind(+m[1]).first();
      return row ? j(row) : j({ error: "not found" }, 404);
    }
    if (m && req.method === "DELETE") {
      const r = await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(+m[1]).run();
      return r.meta.changes ? new Response(null, { status: 204 }) : j({ error: "not found" }, 404);
    }
    return j({ error: "not found" }, 404);
  },
};
