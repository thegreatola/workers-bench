import { exports, env } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));
const STORE = (env as any).STORE as KVNamespace;

it("PUT then GET", async () => {
  expect((await f("/kv/a1", { method: "PUT", body: "hello" })).status).toBe(201);
  const r = await f("/kv/a1");
  expect(r.status).toBe(200);
  expect(await r.text()).toBe("hello");
  expect(await STORE.get("a1")).toBe("hello");
});
it("missing key is 404", async () => {
  expect((await f("/kv/never-set")).status).toBe(404);
});
it("keys are URL-decoded", async () => {
  await f("/kv/hello%20world", { method: "PUT", body: "spaced" });
  expect(await STORE.get("hello world")).toBe("spaced");
});
it("DELETE removes the key", async () => {
  await STORE.put("d1", "x");
  expect((await f("/kv/d1", { method: "DELETE" })).status).toBe(204);
  expect(await STORE.get("d1")).toBeNull();
  expect((await f("/kv/d1")).status).toBe(404);
});
it("ttl sets an expiration", async () => {
  expect((await f("/kv/t1?ttl=120", { method: "PUT", body: "x" })).status).toBe(201);
  const { keys } = await STORE.list({ prefix: "t1" });
  expect(keys[0]?.expiration).toBeGreaterThan(Date.now() / 1000 + 60);
});
it("bad ttl is 400 and stores nothing", async () => {
  for (const t of ["30", "abc", "90.5"]) {
    expect((await f(`/kv/bad${t}?ttl=${t}`, { method: "PUT", body: "x" })).status, t).toBe(400);
    expect(await STORE.get(`bad${t}`)).toBeNull();
  }
});
