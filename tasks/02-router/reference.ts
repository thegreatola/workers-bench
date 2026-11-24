const j = (body: unknown, status = 200) => Response.json(body, { status });
export default {
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    const m = pathname.match(/^\/users\/([^/]+)$/);
    if (req.method === "GET" && m) return /^\d+$/.test(m[1]) ? j({ id: m[1] }) : j({ error: "invalid id" }, 400);
    if (req.method === "POST" && pathname === "/echo") {
      try { return j(JSON.parse(await req.text())); } catch { return j({ error: "invalid json" }, 400); }
    }
    return j({ error: "not found" }, 404);
  },
};
