interface Env { WEBHOOK_SECRET: string }
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/webhook") return new Response("not found", { status: 404 });
    const raw = await req.text();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = "sha256=" + hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
    if (!equal(req.headers.get("X-Signature") ?? "", expected)) return Response.json({ error: "invalid signature" }, { status: 401 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    return Response.json({ received: true, event: body?.event });
  },
};
