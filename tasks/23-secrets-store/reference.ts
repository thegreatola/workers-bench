interface Env { API_KEY: { get(): Promise<string> } }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname !== "/private") return new Response("not found", { status: 404 });
    const key = await env.API_KEY.get();
    const given = req.headers.get("Authorization") ?? "";
    if (given !== `Bearer ${key}`) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json({ ok: true });
  },
};
