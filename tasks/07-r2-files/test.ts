import { exports, env } from "cloudflare:workers";
import { it, expect } from "vitest";
const BUCKET = (env as any).BUCKET as R2Bucket;
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));

it("PUT stores body and content type", async () => {
  const r = await f("/files/docs/readme.md", { method: "PUT", body: "# hi", headers: { "Content-Type": "text/markdown" } });
  expect(r.status).toBe(201);
  const b: any = await r.json();
  const obj = await BUCKET.head("docs/readme.md");
  expect(obj).not.toBeNull();
  expect(b).toEqual({ key: "docs/readme.md", size: 4, etag: obj!.etag });
  expect(obj!.httpMetadata?.contentType).toBe("text/markdown");
});
it("GET returns body, type and ETag", async () => {
  await BUCKET.put("img/a.bin", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "application/octet-stream" } });
  const obj = await BUCKET.head("img/a.bin");
  const r = await f("/files/img/a.bin");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("application/octet-stream");
  expect(r.headers.get("etag")).toBe(obj!.httpEtag);
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
});
it("If-None-Match gives 304", async () => {
  await BUCKET.put("c.txt", "cache me");
  const tag = (await BUCKET.head("c.txt"))!.httpEtag;
  const r = await f("/files/c.txt", { headers: { "If-None-Match": tag } });
  expect(r.status).toBe(304);
  expect(await r.text()).toBe("");
  const r2 = await f("/files/c.txt", { headers: { "If-None-Match": '"other"' } });
  expect(r2.status).toBe(200);
  expect(await r2.text()).toBe("cache me");
});
it("missing is 404", async () => {
  expect((await f("/files/nope.txt")).status).toBe(404);
});
it("DELETE removes it", async () => {
  await BUCKET.put("gone.txt", "x");
  expect((await f("/files/gone.txt", { method: "DELETE" })).status).toBe(204);
  expect(await BUCKET.head("gone.txt")).toBeNull();
});
