export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    const body = JSON.stringify({ status: "ok", path: new URL(req.url).pathname });
    return new Response(req.method === "HEAD" ? null : body, { headers: { "Content-Type": "application/json" } });
  },
};
