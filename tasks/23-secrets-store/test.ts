import { env, exports } from "cloudflare:workers";
import { adminSecretsStore } from "cloudflare:test";
import { it, expect, beforeAll } from "vitest";
const call = (auth?: string, path = "/private") => exports.default.fetch(new Request("http://w.test" + path, { headers: auth ? { Authorization: auth } : {} }));

beforeAll(async () => { await adminSecretsStore((env as any).API_KEY).create("k-7f3a-bench"); });

it("right key", async () => {
  const r = await call("Bearer k-7f3a-bench");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});
it("wrong or missing key", async () => {
  for (const a of [undefined, "Bearer nope", "k-7f3a-bench", "Bearer k-7f3a-bench-extra", "Basic k-7f3a-bench"]) {
    const r = await call(a);
    expect(r.status, String(a)).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
  }
});
it("other paths are 404", async () => {
  expect((await call("Bearer k-7f3a-bench", "/public")).status).toBe(404);
});
