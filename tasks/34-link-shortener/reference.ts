interface Env { LINKS: KVNamespace; DB: D1Database; CLICKS: Queue<Click>; ADMIN_TOKEN: string }
interface Click { slug: string; country: string; at: number }
const j = (b: unknown, status = 200) => Response.json(b, { status });
const SLUG = /^[a-z0-9-]{3,32}$/;
let schema: Promise<unknown> | null = null;
const ready = (env: Env) => (schema ??= env.DB.prepare("CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, country TEXT NOT NULL, at INTEGER NOT NULL)").run());

function validUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2048) return false;
  try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; }
}
function randomSlug(): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => a[b % a.length]).join("");
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === "/api/links" && req.method === "POST") {
      let b: any;
      try { b = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
      if (!validUrl(b?.url)) return j({ error: "invalid url" }, 400);
      let slug: string;
      if (b.slug !== undefined) {
        if (typeof b.slug !== "string" || !SLUG.test(b.slug) || b.slug === "api") return j({ error: "invalid slug" }, 400);
        if ((await env.LINKS.get(b.slug)) !== null) return j({ error: "slug taken" }, 409);
        slug = b.slug;
      } else {
        do slug = randomSlug(); while ((await env.LINKS.get(slug)) !== null);
      }
      await env.LINKS.put(slug, b.url);
      return j({ slug, url: b.url, shortUrl: `${url.origin}/${slug}` }, 201);
    }
    let m = p.match(/^\/api\/links\/([^/]+)\/stats$/);
    if (m && req.method === "GET") {
      if ((await env.LINKS.get(m[1])) === null) return j({ error: "not found" }, 404);
      await ready(env);
      const { results } = await env.DB.prepare("SELECT country, COUNT(*) AS n FROM clicks WHERE slug = ? GROUP BY country").bind(m[1]).all<{ country: string; n: number }>();
      const countries: Record<string, number> = {};
      let clicks = 0;
      for (const r of results) { countries[r.country] = r.n; clicks += r.n; }
      return j({ slug: m[1], clicks, countries });
    }
    m = p.match(/^\/api\/links\/([^/]+)$/);
    if (m && req.method === "DELETE") {
      if (req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return j({ error: "unauthorized" }, 401);
      await env.LINKS.delete(m[1]);
      await ready(env);
      await env.DB.prepare("DELETE FROM clicks WHERE slug = ?").bind(m[1]).run();
      return new Response(null, { status: 204 });
    }
    m = p.match(/^\/([a-z0-9-]+)$/);
    if (m && req.method === "GET") {
      const target = await env.LINKS.get(m[1]);
      if (target === null) return new Response("not found", { status: 404 });
      const country = (req as any).cf?.country ?? "XX";
      ctx.waitUntil(env.CLICKS.send({ slug: m[1], country, at: Date.now() }));
      return Response.redirect(target, 302);
    }
    return j({ error: "not found" }, 404);
  },
  async queue(batch: MessageBatch<Click>, env: Env): Promise<void> {
    await ready(env);
    // One statement per click in one batch call: a multi-row INSERT would pass D1's 100 bound-parameter limit.
    await env.DB.batch(batch.messages.map((m) => env.DB.prepare("INSERT INTO clicks (slug, country, at) VALUES (?, ?, ?)").bind(m.body.slug, m.body.country, m.body.at)));
    batch.ackAll();
  },
};
