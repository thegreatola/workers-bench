import { DurableObject } from "cloudflare:workers";
interface Env { LIMITER: DurableObjectNamespace<RateLimiter> }
const LIMIT = 5, WINDOW = 60_000;
export class RateLimiter extends DurableObject<Env> {
  async take(): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
    const now = Date.now();
    let w = (await this.ctx.storage.get<{ start: number; count: number }>("w")) ?? { start: now, count: 0 };
    if (now - w.start >= WINDOW) w = { start: now, count: 0 };
    if (w.count >= LIMIT) return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((w.start + WINDOW - now) / 1000)) };
    w.count++;
    await this.ctx.storage.put("w", w);
    return { ok: true, remaining: LIMIT - w.count, retryAfter: 0 };
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname !== "/api") return new Response("not found", { status: 404 });
    const ip = req.headers.get("CF-Connecting-IP") ?? "anonymous";
    const r = await env.LIMITER.get(env.LIMITER.idFromName(ip)).take();
    if (!r.ok) return Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
    return Response.json({ remaining: r.remaining }, { headers: { "X-RateLimit-Remaining": String(r.remaining) } });
  },
};
