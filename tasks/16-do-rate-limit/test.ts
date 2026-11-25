import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const hit = (ip?: string) => exports.default.fetch(new Request("http://w.test/api", { headers: ip ? { "CF-Connecting-IP": ip } : {} }));

it("counts down, then limits", async () => {
  for (let left = 4; left >= 0; left--) {
    const r = await hit("10.0.0.1");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ remaining: left });
    expect(r.headers.get("x-ratelimit-remaining")).toBe(String(left));
  }
  const r = await hit("10.0.0.1");
  expect(r.status).toBe(429);
  expect(await r.json()).toEqual({ error: "rate limited" });
  const after = Number(r.headers.get("retry-after"));
  expect(Number.isInteger(after)).toBe(true);
  expect(after).toBeGreaterThanOrEqual(1);
  expect(after).toBeLessThanOrEqual(60);
});
it("clients are separate", async () => {
  for (let i = 0; i < 5; i++) await hit("10.0.0.2");
  expect((await hit("10.0.0.2")).status).toBe(429);
  const other = await hit("10.0.0.3");
  expect(other.status).toBe(200);
  expect(await other.json()).toEqual({ remaining: 4 });
});
it("no IP header means one shared anonymous client", async () => {
  for (let i = 0; i < 5; i++) expect((await hit()).status).toBe(200);
  expect((await hit()).status).toBe(429);
});
it("parallel requests cannot beat the limit", async () => {
  const rs = await Promise.all(Array.from({ length: 12 }, () => hit("10.0.0.9")));
  expect(rs.filter((r) => r.status === 200).length).toBe(5);
  expect(rs.filter((r) => r.status === 429).length).toBe(7);
});
