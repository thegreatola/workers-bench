import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const SECRET = "test-secret-for-the-benchmark";

async function sign(body: string, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const send = (body: string, sig?: string) =>
  exports.default.fetch(new Request("http://w.test/webhook", { method: "POST", body, headers: sig ? { "X-Signature": sig } : {} }));

it("valid signature", async () => {
  const body = JSON.stringify({ event: "order.paid", amount: 12 });
  const r = await send(body, await sign(body));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ received: true, event: "order.paid" });
});
it("signature over the exact raw bytes", async () => {
  const body = '{ "event" :  "spaced",\n"x":1 }';
  expect((await send(body, await sign(body))).status).toBe(200);
});
it("wrong secret is 401", async () => {
  const body = JSON.stringify({ event: "x" });
  const r = await send(body, await sign(body, "other"));
  expect(r.status).toBe(401);
  expect(await r.json()).toEqual({ error: "invalid signature" });
});
it("tampered body is 401", async () => {
  const sig = await sign(JSON.stringify({ event: "a" }));
  expect((await send(JSON.stringify({ event: "b" }), sig)).status).toBe(401);
});
it("missing or malformed header is 401", async () => {
  const body = JSON.stringify({ event: "x" });
  expect((await send(body)).status).toBe(401);
  expect((await send(body, "sha256=zz")).status).toBe(401);
  expect((await send(body, (await sign(body)).slice(7))).status).toBe(401);
});
it("unsigned junk is 401, signed junk is 400", async () => {
  expect((await send("not json", "sha256=00")).status).toBe(401);
  expect((await send("not json", await sign("not json"))).status).toBe(400);
});
