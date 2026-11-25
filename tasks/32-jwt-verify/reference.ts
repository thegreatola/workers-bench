interface Env { JWKS: string; ISSUER: string; AUDIENCE: string }
const SKEW = 60;
const ALGS: Record<string, { kty: string; import: any; verify: any }> = {
  RS256: { kty: "RSA", import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
  ES256: { kty: "EC", import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
};
function b64uDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64uDecode(s)));
async function verify(token: string, env: Env): Promise<any | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = json(parts[0]);
  const payload = json(parts[1]);
  const alg = ALGS[header?.alg];
  if (!alg) return null;
  const jwk = (JSON.parse(env.JWKS).keys as any[]).find((k) => k.kid === header.kid);
  if (!jwk || jwk.alg !== header.alg || jwk.kty !== alg.kty) return null;
  const { kid, alg: _a, use, ...keyData } = jwk;
  const key = await crypto.subtle.importKey("jwk", keyData, alg.import, false, ["verify"]);
  const ok = await crypto.subtle.verify(alg.verify, key, b64uDecode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== env.ISSUER) return null;
  if (!(payload.aud === env.AUDIENCE || (Array.isArray(payload.aud) && payload.aud.includes(env.AUDIENCE)))) return null;
  if (typeof payload.exp !== "number" || payload.exp < now - SKEW) return null;
  if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now + SKEW)) return null;
  return payload;
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname !== "/me") return new Response("not found", { status: 404 });
    const m = (req.headers.get("Authorization") ?? "").match(/^Bearer (.+)$/);
    let claims: any = null;
    try { if (m) claims = await verify(m[1], env); } catch { claims = null; }
    if (!claims) return Response.json({ error: "invalid token" }, { status: 401 });
    return Response.json({ sub: claims.sub });
  },
};
