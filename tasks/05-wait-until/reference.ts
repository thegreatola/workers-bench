interface Env { STATS: KVNamespace }
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    let m = pathname.match(/^\/hit\/([^/]+)$/);
    if (m) {
      const key = `count:${decodeURIComponent(m[1])}`;
      ctx.waitUntil((async () => { const n = Number((await env.STATS.get(key)) ?? 0); await env.STATS.put(key, String(n + 1)); })());
      return new Response("ok");
    }
    m = pathname.match(/^\/count\/([^/]+)$/);
    if (m) return new Response((await env.STATS.get(`count:${decodeURIComponent(m[1])}`)) ?? "0");
    return new Response("not found", { status: 404 });
  },
};
