interface Env { BOOKMARKS: KVNamespace }
interface Bookmark { url: string; title: string; tags: string[] }
const j = (b: unknown, status = 200) => Response.json(b, { status });
const TAG = /^[a-z0-9-]{1,40}$/;

async function id(url: string): Promise<string> {
  return encodeURIComponent(url);
}
function parse(b: any): Bookmark | null {
  if (typeof b?.url !== "string" || b.url.length > 4000 || typeof b?.title !== "string" || b.title.length > 200 || !Array.isArray(b?.tags) || b.tags.length > 100) return null;
  try { const p = new URL(b.url); if (p.protocol !== "http:" && p.protocol !== "https:") return null; } catch { return null; }
  if (!b.tags.every((t: unknown) => typeof t === "string" && TAG.test(t))) return null;
  return { url: b.url, title: b.title, tags: [...new Set<string>(b.tags)].sort() };
}
async function remove(env: Env, old: Bookmark, h: string) {
  await Promise.all([env.BOOKMARKS.delete(`b:${h}`), ...old.tags.map((t) => env.BOOKMARKS.delete(`t:${t}:${h}`))]);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname !== "/bookmarks") return j({ error: "not found" }, 404);
    if (req.method === "PUT") {
      let body: any;
      try { body = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
      const bm = parse(body);
      if (!bm) return j({ error: "invalid bookmark" }, 400);
      const h = await id(bm.url);
      const old = await env.BOOKMARKS.get<Bookmark>(`b:${h}`, "json");
      if (old) await Promise.all(old.tags.filter((t) => !bm.tags.includes(t)).map((t) => env.BOOKMARKS.delete(`t:${t}:${h}`)));
      await env.BOOKMARKS.put(`b:${h}`, JSON.stringify(bm));
      await Promise.all(bm.tags.map((t) => env.BOOKMARKS.put(`t:${t}:${h}`, "")));
      return j(bm);
    }
    const url = u.searchParams.get("url");
    const tag = u.searchParams.get("tag");
    if (req.method === "GET" && tag !== null) {
      const hashes: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await env.BOOKMARKS.list({ prefix: `t:${tag}:`, cursor });
        hashes.push(...page.keys.map((k) => k.name.slice(`t:${tag}:`.length)));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      const all = (await Promise.all(hashes.map((h) => env.BOOKMARKS.get<Bookmark>(`b:${h}`, "json")))).filter((b): b is Bookmark => !!b && b.tags.includes(tag));
      return j({ bookmarks: all.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)) });
    }
    if (url === null) return j({ error: "url or tag required" }, 400);
    const h = await id(url);
    const bm = await env.BOOKMARKS.get<Bookmark>(`b:${h}`, "json");
    if (req.method === "GET") return bm ? j(bm) : j({ error: "not found" }, 404);
    if (req.method === "DELETE") {
      if (!bm) return j({ error: "not found" }, 404);
      await remove(env, bm, h);
      return new Response(null, { status: 204 });
    }
    return j({ error: "method not allowed" }, 405);
  },
};
