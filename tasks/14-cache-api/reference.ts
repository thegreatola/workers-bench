interface Env { CALLS: KVNamespace }
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/price\/([^/]+)$/);
    if (req.method !== "GET" || !m) return new Response("not found", { status: 404 });
    const cache = caches.default;
    const key = new Request(url.toString());
    const hit = await cache.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("X-Cache", "HIT");
      return res;
    }
    const sku = decodeURIComponent(m[1]);
    await env.CALLS.put("calls", String(Number((await env.CALLS.get("calls")) ?? 0) + 1));
    const res = Response.json({ sku, price: sku.length * 100 }, { headers: { "Cache-Control": "max-age=60", "X-Cache": "MISS" } });
    await cache.put(key, res.clone());
    return res;
  },
};
