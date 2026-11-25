import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));
const put = (b: unknown) => f("/bookmarks", { method: "PUT", body: JSON.stringify(b), headers: { "content-type": "application/json" } });
const get = (url: string) => f(`/bookmarks?url=${encodeURIComponent(url)}`);
const byTag = async (tag: string) => ((await (await f(`/bookmarks?tag=${tag}`)).json()) as any).bookmarks;

it("save, read and normalise tags", async () => {
  const r = await put({ url: "https://example.com/a", title: "A", tags: ["b", "a", "b"] });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ url: "https://example.com/a", title: "A", tags: ["a", "b"] });
  expect(await (await get("https://example.com/a")).json()).toEqual({ url: "https://example.com/a", title: "A", tags: ["a", "b"] });
  expect((await get("https://example.com/missing")).status).toBe(404);
});
it("very long URLs work", async () => {
  const long = "https://shop.example.com/p?" + Array.from({ length: 120 }, (_, i) => `utm_param_${i}=valeur-${i}`).join("&") + "&q=" + encodeURIComponent("é".repeat(100));
  expect(long.length).toBeGreaterThan(3000);
  expect(long.length).toBeLessThanOrEqual(4000);
  expect((await put({ url: long, title: "Long", tags: ["long"] })).status).toBe(200);
  expect(((await (await get(long)).json()) as any).title).toBe("Long");
  expect((await byTag("long")).map((b: any) => b.url)).toEqual([long]);
});
it("a hundred long tags work", async () => {
  const tags = Array.from({ length: 100 }, (_, i) => `tag-${String(i).padStart(3, "0")}-` + "x".repeat(32));
  const url = "https://example.com/tagged";
  const r = await put({ url, title: "Tagged", tags });
  expect(r.status).toBe(200);
  expect(((await (await get(url)).json()) as any).tags).toEqual([...tags].sort());
  expect((await byTag(tags[57])).map((b: any) => b.url)).toEqual([url]);
});
it("tag listings follow updates and deletes", async () => {
  await put({ url: "https://a.test/1", title: "1", tags: ["red", "blue"] });
  await put({ url: "https://a.test/2", title: "2", tags: ["red"] });
  expect((await byTag("red")).map((b: any) => b.url)).toEqual(["https://a.test/1", "https://a.test/2"]);
  await put({ url: "https://a.test/1", title: "1b", tags: ["blue"] });
  expect((await byTag("red")).map((b: any) => b.url)).toEqual(["https://a.test/2"]);
  expect(await byTag("blue")).toEqual([{ url: "https://a.test/1", title: "1b", tags: ["blue"] }]);
  expect((await f(`/bookmarks?url=${encodeURIComponent("https://a.test/2")}`, { method: "DELETE" })).status).toBe(204);
  expect(await byTag("red")).toEqual([]);
  expect((await f(`/bookmarks?url=${encodeURIComponent("https://a.test/2")}`, { method: "DELETE" })).status).toBe(404);
});
it("validates input", async () => {
  for (const b of [{}, { url: "ftp://x.test", title: "t", tags: [] }, { url: "https://x.test/" + "a".repeat(4000), title: "t", tags: [] }, { url: "https://x.test", title: "t".repeat(201), tags: [] }, { url: "https://x.test", title: "t", tags: ["Bad"] }, { url: "https://x.test", title: "t", tags: Array.from({ length: 101 }, (_, i) => `t${i}`) }, { url: "https://x.test", title: "t", tags: ["x".repeat(41)] }]) {
    expect((await put(b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
  }
});
