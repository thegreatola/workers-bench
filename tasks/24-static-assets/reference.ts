interface Env { ASSETS: Fetcher }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/health") return Response.json({ ok: true });
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const asset = await env.ASSETS.fetch(req);
    const res = new Response(asset.body, asset);
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Content-Security-Policy", "default-src 'self'");
    return res;
  },
};
