interface Env { STORE: KVNamespace }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/kv\/(.+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const key = decodeURIComponent(m[1]);
    if (req.method === "PUT") {
      const t = url.searchParams.get("ttl");
      let opts: KVNamespacePutOptions = {};
      if (t !== null) {
        if (!/^\d+$/.test(t) || Number(t) < 60) return new Response("bad ttl", { status: 400 });
        opts = { expirationTtl: Number(t) };
      }
      await env.STORE.put(key, await req.text(), opts);
      return new Response(null, { status: 201 });
    }
    if (req.method === "GET") {
      const v = await env.STORE.get(key);
      return v === null ? new Response("not found", { status: 404 }) : new Response(v);
    }
    if (req.method === "DELETE") { await env.STORE.delete(key); return new Response(null, { status: 204 }); }
    return new Response("not found", { status: 404 });
  },
};
