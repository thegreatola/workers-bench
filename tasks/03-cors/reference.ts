interface Env { ALLOWED_ORIGINS: string }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const origin = req.headers.get("Origin");
    const ok = origin !== null && allowed.includes(origin);
    if (req.method === "OPTIONS") {
      if (!ok) return new Response(null, { status: 403 });
      const h = new Headers({ "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400", Vary: "Origin" });
      const rh = req.headers.get("Access-Control-Request-Headers");
      if (rh) h.set("Access-Control-Allow-Headers", rh);
      return new Response(null, { status: 204, headers: h });
    }
    if (req.method === "GET" && new URL(req.url).pathname === "/data") {
      const res = Response.json({ data: 42 });
      if (ok) { res.headers.set("Access-Control-Allow-Origin", origin!); res.headers.set("Vary", "Origin"); }
      return res;
    }
    return new Response("not found", { status: 404 });
  },
};
