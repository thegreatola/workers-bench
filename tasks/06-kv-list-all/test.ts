import { exports, env } from "cloudflare:workers";
import { it, expect, beforeAll } from "vitest";
const STORE = (env as any).STORE as KVNamespace;
const f = (path: string) => exports.default.fetch(new Request("http://w.test" + path));
const pad = (i: number) => String(i).padStart(5, "0");

beforeAll(async () => {
  const puts: Promise<void>[] = [];
  for (let i = 0; i < 1250; i++) puts.push(STORE.put(`user:${pad(i)}`, "1"));
  for (let i = 0; i < 7; i++) puts.push(STORE.put(`order:${pad(i)}`, "1"));
  await Promise.all(puts);
}, 60000);

it("a small prefix", async () => {
  const r = await f("/keys?prefix=order:");
  expect(r.status).toBe(200);
  const b: any = await r.json();
  expect(b.count).toBe(7);
  expect(b.keys).toEqual(Array.from({ length: 7 }, (_, i) => `order:${pad(i)}`));
});
it("more than one page of keys", async () => {
  const b: any = await (await f("/keys?prefix=user:")).json();
  expect(b.count).toBe(1250);
  expect(b.keys.length).toBe(1250);
  expect(b.keys[0]).toBe("user:00000");
  expect(b.keys[1249]).toBe("user:01249");
  expect(new Set(b.keys).size).toBe(1250);
});
it("no prefix means every key", async () => {
  const b: any = await (await f("/keys")).json();
  expect(b.count).toBe(1257);
});
it("unmatched prefix is empty", async () => {
  expect(await (await f("/keys?prefix=zzz")).json()).toEqual({ count: 0, keys: [] });
});
