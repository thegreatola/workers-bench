import { exports, env } from "cloudflare:workers";
import { it, expect, beforeAll } from "vitest";
const BUCKET = (env as any).BUCKET as R2Bucket;
const DATA = "0123456789abcdefghij"; // 20 bytes
const get = (range?: string, key = "data.txt") => exports.default.fetch(new Request(`http://w.test/files/${key}`, { headers: range ? { Range: range } : {} }));

beforeAll(async () => { await BUCKET.put("data.txt", DATA); });

it("whole object", async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.headers.get("accept-ranges")).toBe("bytes");
  expect(await r.text()).toBe(DATA);
});
it("start-end", async () => {
  const r = await get("bytes=2-5");
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe("bytes 2-5/20");
  expect(r.headers.get("content-length")).toBe("4");
  expect(await r.text()).toBe("2345");
});
it("open-ended start", async () => {
  const r = await get("bytes=15-");
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe("bytes 15-19/20");
  expect(await r.text()).toBe("fghij");
});
it("suffix", async () => {
  const r = await get("bytes=-3");
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe("bytes 17-19/20");
  expect(await r.text()).toBe("hij");
});
it("end past the last byte is clamped", async () => {
  const r = await get("bytes=18-100");
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe("bytes 18-19/20");
  expect(await r.text()).toBe("ij");
});
it("unsatisfiable or malformed is 416", async () => {
  for (const h of ["bytes=20-", "bytes=25-30", "bytes=5-2", "items=0-1", "bytes=abc"]) {
    const r = await get(h);
    expect(r.status, h).toBe(416);
    expect(r.headers.get("content-range"), h).toBe("bytes */20");
  }
});
it("missing object is 404", async () => {
  expect((await get(undefined, "nope.txt")).status).toBe(404);
});
