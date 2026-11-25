import { exports, env } from "cloudflare:workers";
import { it, expect } from "vitest";
const CALLS = (env as any).CALLS as KVNamespace;
const f = (path: string) => exports.default.fetch(new Request("https://shop.example.com" + path));
const calls = async () => Number((await CALLS.get("calls")) ?? 0);

it("miss, then hit", async () => {
  const before = await calls();
  const a = await f("/price/abc");
  expect(a.status).toBe(200);
  expect(a.headers.get("x-cache")).toBe("MISS");
  expect(await a.json()).toEqual({ sku: "abc", price: 300 });
  const b = await f("/price/abc");
  expect(b.headers.get("x-cache")).toBe("HIT");
  expect(await b.json()).toEqual({ sku: "abc", price: 300 });
  expect(await calls()).toBe(before + 1);
});
it("different SKUs are cached apart", async () => {
  const before = await calls();
  expect((await f("/price/longer-sku")).headers.get("x-cache")).toBe("MISS");
  expect((await f("/price/zz")).headers.get("x-cache")).toBe("MISS");
  expect((await f("/price/longer-sku")).headers.get("x-cache")).toBe("HIT");
  expect(await calls()).toBe(before + 2);
});
it("the cached copy has a 60 s lifetime", async () => {
  await f("/price/ttl");
  const hit = await caches.default.match("https://shop.example.com/price/ttl");
  expect(hit).toBeDefined();
  expect(hit!.headers.get("cache-control")).toMatch(/max-age=60/);
});
