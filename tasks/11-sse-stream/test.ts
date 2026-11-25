import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string) => exports.default.fetch(new Request("http://w.test" + path));
const expected = (n: number) => Array.from({ length: n }, (_, k) => `id: ${k + 1}\nevent: tick\ndata: {"i":${k + 1}}\n\n`).join("") + "event: done\ndata: {}\n\n";

it("default count is 3", async () => {
  const r = await f("/events");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/^text\/event-stream/);
  expect(r.headers.get("cache-control")).toMatch(/no-cache/);
  expect(await r.text()).toBe(expected(3));
});
it("custom count", async () => {
  expect(await (await f("/events?count=12")).text()).toBe(expected(12));
});
it("the body is a stream", async () => {
  const r = await f("/events?count=50");
  expect(r.body).toBeInstanceOf(ReadableStream);
  expect(r.headers.get("content-length")).toBeNull();
  expect(await r.text()).toBe(expected(50));
});
it("bad count is 400", async () => {
  for (const c of ["0", "51", "abc", "2.5"]) expect((await f(`/events?count=${c}`)).status, c).toBe(400);
});
