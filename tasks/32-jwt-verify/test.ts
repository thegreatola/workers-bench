import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";

// Throwaway keys made for this benchmark only. The public halves are in wrangler.jsonc.
const RSA_PRIVATE = {"kty":"RSA","n":"qW370m5HyUrnn9VqlID-DWuGqDVC8p3IFqZ4S1SipL6XClqqCRmIhmfH-FavifDMQ5ExJSHkwoGcuh6Z70eers1Cdk_AQgxzvvefhxt68YePEcqOhHBBKxM81zvsFGpe5aG9GLgfZF4AKasap2a9feAIGpk-2X6FSVT14H4cGMDETtqQV4xU3prsEOx5wGwixrUhPGyoiMCdQ3U3LDAmELmL0V3oJiedCk3sGxhntQX_n73CXgy1W2MqL3MZYf0E3i9W0cmJGkOKTzwCbRw4WOBjLGac65ug9fV9Zbu8oUG7QVwWbl7-R9W-nPhytsuxiCudXkxAbVFHMKjnUOpcOw","e":"AQAB","d":"UMFoZstDkhEOx6MMUs4MyU639xKz3zoPNaSQ767eetGQ4lGGfCHcbdund5mxv3izk3zvxLgb9g2bKycMzf0ACGczR3sJszGGNb6HHfmeJuMq8RrvxPZQSXy44gngo3Zz1tW5cL_JzqfzQekZIjMZHJccpbjnOPlSBDrnmuHg-HaaUjSvbi-pLc6uneseBDf7qjUKCKWiPkPktCRAG6ADaD61cTZCpYmSX4WrIFvpBUt8GajcRvl4edaviZtPErfHVg8ki7w9ZVezXqktUfq228NTm0lRqSfOIhfpxzhueo5V0rKRtWvR7MbZOqo7qMgDu96-bIqoZq9A1Yvg2eM6cQ","p":"0EjJWwbe8VhUATXNW8stMKMJFDTpiTupV6QpIHN6W0QCUNPh5xLMQUUd2Bv-_aanB_AT9-mSKM7C0cb4I69dB7ALwzWscOwh7z4HVCJU7SXVzQXPXWXpEQo7ABVfc718sjf_lNgMkV2l-jJb0Jz3et7flzIluyVkLpuz1nP9bfM","q":"0D5-GG-B92xZDv4mofu4YuoxIEAJ5YyFsnkwXq2hAiQinhCsGq4CudHsUkPVeKJTpXwr-88hVIGvJKbXJwzfv7MY7QGfrdTwmXuHTp4b7_CIuiw4v08z0VyrRY0embA42YcK_cfPSbG42hCEE70Cq0hud425bpfgDYk9fl85Qpk","dp":"IsZkR_xnsKfsrp8LAG51xw8Rbvw-mZkKdwWDkFV3clFyiYg2yVvMGoGtr-1Mr5DphlvBGb03l_SddmTf_SVERQpRjHAjsF7cc5NJqfRpdYbBoY98xb1EIoIww5zN6QcUELVkyLchsguOsK1DwxrR_wPDFP1ca1ic12NLrVyETZ0","dq":"Dr2NsW8bNQdfWndVBrxJtf670XuW97-1qwd3DAygTAWAyc2GUTEmEj8wyjXxA2QCJcGfX2ivBEtVuXNx4VrA79HentAxnF1pVoPu9PquIZLWKs98iNYzZct4eCjgFKLrs0Ii3gnpu16wJgdrQfZsHPG4mA_ZI2HuwyaGys40wGk","qi":"Ylx4yzceFgnzp-Z7mSwKJUwBkWCqq7ErEmRPimENA54H-mOooGqVU9A2LgUm5ayeB_VHFoFlFPrrZLR1yuK92rRVl5XMduHqrDbn_VYzb8qCJFfjEkPhkCXiZy9PbodwV-t7RRDq96A3p65C5wiAsNxChOFDJHEXFXyI1EqThic","kid":"rsa-1"};
const EC_PRIVATE = {"kty":"EC","x":"REr0XkvcL2QwUDqCPX3scV_UGYk537xO-RXViqTPxx8","y":"4asdSDqvJeFIaewGwVqmvsOOAlsIMxokEQzS2STMejM","crv":"P-256","d":"kjcfRMYNxiytmJxzqdAV7XZrTOv7zDqerUpOta0yfTU","kid":"ec-1"};
const ISS = "https://auth.bench.test/", AUD = "workers-bench-api";
const now = () => Math.floor(Date.now() / 1000);

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
async function sign(header: any, payload: any, key: "rsa" | "ec" | "none" | { hmac: string } = header.alg === "ES256" ? "ec" : "rsa") {
  const input = enc(header) + "." + enc(payload);
  if (key === "none") return input + ".";
  let sig: ArrayBuffer;
  if (typeof key === "object") {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key.hmac), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(input));
  } else if (key === "rsa") {
    const k = await crypto.subtle.importKey("jwk", RSA_PRIVATE, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(input));
  } else {
    const k = await crypto.subtle.importKey("jwk", EC_PRIVATE, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, new TextEncoder().encode(input));
  }
  return input + "." + b64u(new Uint8Array(sig));
}
const claims = (extra: any = {}) => ({ iss: ISS, aud: AUD, sub: "user-1", exp: now() + 600, ...extra });
const me = (token?: string) => exports.default.fetch(new Request("http://w.test/me", { headers: token ? { Authorization: "Bearer " + token } : {} }));
async function ok(token: string, sub = "user-1") { const r = await me(token); expect(r.status).toBe(200); expect(await r.json()).toEqual({ sub }); }
async function no(token: string | undefined, why: string) { const r = await me(token); expect(r.status, why).toBe(401); expect(await r.json()).toEqual({ error: "invalid token" }); }

it("valid RS256 and ES256 tokens", async () => {
  await ok(await sign({ alg: "RS256", kid: "rsa-1", typ: "JWT" }, claims()));
  await ok(await sign({ alg: "ES256", kid: "ec-1", typ: "JWT" }, claims({ sub: "ec-user" })), "ec-user");
});
it("base64url claims with - and _", async () => {
  const sub = "üser>>>???~~~" + "ÿ".repeat(5);
  await ok(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ sub })), sub);
});
it("aud may be an array", async () => {
  await ok(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ aud: ["other", AUD] })));
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ aud: ["other"] })), "aud array without ours");
});
it("expiry with 60 s of skew", async () => {
  await ok(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ exp: now() - 30 })));
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ exp: now() - 120 })), "expired");
  const { exp, ...noExp } = claims();
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, noExp), "no exp");
});
it("not-before with 60 s of skew", async () => {
  await ok(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ nbf: now() + 30 })));
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ nbf: now() + 120 })), "not yet valid");
});
it("issuer and audience must match", async () => {
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ iss: "https://evil.test/" })), "iss");
  await no(await sign({ alg: "RS256", kid: "rsa-1" }, claims({ aud: "someone-else" })), "aud");
});
it("keys and algorithms", async () => {
  await no(await sign({ alg: "RS256", kid: "nope" }, claims()), "unknown kid");
  await no(await sign({ alg: "ES256", kid: "rsa-1" }, claims(), "ec"), "alg does not match the key");
  await no(await sign({ alg: "none", kid: "rsa-1" }, claims(), "none"), "alg none");
  const rsaPublicJson = JSON.stringify({ kty: RSA_PRIVATE.kty, n: RSA_PRIVATE.n, e: RSA_PRIVATE.e });
  await no(await sign({ alg: "HS256", kid: "rsa-1" }, claims(), { hmac: rsaPublicJson }), "HS256 with the public key as secret");
});
it("tampering and junk", async () => {
  const good = await sign({ alg: "RS256", kid: "rsa-1" }, claims());
  const [h, , s] = good.split(".");
  await no(h + "." + enc(claims({ sub: "admin" })) + "." + s, "swapped payload");
  await no(good.slice(0, -4) + "AAAA", "bad signature");
  await no(undefined, "no header");
  await no("abc.def", "two parts");
  await no("not a token", "junk");
});
