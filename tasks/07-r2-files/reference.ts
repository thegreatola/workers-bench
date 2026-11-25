interface Env { BUCKET: R2Bucket }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/files\/(.+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const key = decodeURIComponent(m[1]);
    if (req.method === "PUT") {
      const obj = await env.BUCKET.put(key, await req.arrayBuffer(), { httpMetadata: { contentType: req.headers.get("Content-Type") ?? undefined } });
      return Response.json({ key, size: obj.size, etag: obj.etag }, { status: 201 });
    }
    if (req.method === "GET") {
      const head = await env.BUCKET.head(key);
      if (!head) return new Response("not found", { status: 404 });
      if (req.headers.get("If-None-Match") === head.httpEtag) return new Response(null, { status: 304, headers: { ETag: head.httpEtag } });
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response("not found", { status: 404 });
      const h = new Headers();
      obj.writeHttpMetadata(h);
      h.set("ETag", obj.httpEtag);
      return new Response(obj.body, { headers: h });
    }
    if (req.method === "DELETE") { await env.BUCKET.delete(key); return new Response(null, { status: 204 }); }
    return new Response("method not allowed", { status: 405 });
  },
};
