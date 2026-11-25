interface Env { JWKS: string; ISSUER: string; AUDIENCE: string }
const dec = (s: string) => JSON.parse(atob(s));
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const t = (req.headers.get("Authorization") ?? "").slice(7);
      const [h, p, s] = t.split(".");
      const header = dec(h), payload = dec(p);
      const jwk = JSON.parse(env.JWKS).keys.find((k: any) => k.kid === header.kid);
      const params = jwk.kty === "RSA" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
      const key = await crypto.subtle.importKey("jwk", jwk, params, false, ["verify"]);
      const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const ok = await crypto.subtle.verify(jwk.kty === "RSA" ? params : { name: "ECDSA", hash: "SHA-256" }, key, sig, new TextEncoder().encode(h + "." + p));
      if (!ok || payload.iss !== env.ISSUER || payload.aud !== env.AUDIENCE || payload.exp < Date.now() / 1000) throw 0;
      return Response.json({ sub: payload.sub });
    } catch { return Response.json({ error: "invalid token" }, { status: 401 }); }
  },
};
