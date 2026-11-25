import { env, exports } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/index";
const ORIGIN = "https://sho.rt";
const f = (path: string, init?: RequestInit & { cf?: unknown }) => exports.default.fetch(new Request(ORIGIN + path, init as RequestInit));
const create = (body: unknown) => f("/api/links", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const stats = async (slug: string) => { const r = await f(`/api/links/${slug}/stats`); return { status: r.status, body: r.status === 200 ? ((await r.json()) as any) : null }; };

/** A batch whose acks are recorded, like the one the queue hands the consumer. */
async function consume(bodies: unknown[]) {
  const acked = new Set<string>();
  let all = false;
  const batch = {
    queue: "clicks",
    messages: bodies.map((body, i) => ({ id: `c${i}`, timestamp: new Date(), attempts: 1, body, ack: () => acked.add(`c${i}`), retry: () => {} })),
    ackAll: () => { all = true; }, retryAll: () => {},
  };
  const ctx = createExecutionContext();
  await (worker as any).queue(batch, env, ctx);
  await waitOnExecutionContext(ctx);
  return all || acked.size === bodies.length;
}

it("creates a custom slug and redirects", async () => {
  const r = await create({ url: "https://example.com/a?b=1", slug: "my-link" });
  expect(r.status).toBe(201);
  expect(await r.json()).toEqual({ slug: "my-link", url: "https://example.com/a?b=1", shortUrl: `${ORIGIN}/my-link` });
  const g = await f("/my-link", { redirect: "manual" });
  expect(g.status).toBe(302);
  expect(g.headers.get("location")).toBe("https://example.com/a?b=1");
  expect((await f("/nope-nope", { redirect: "manual" })).status).toBe(404);
});
it("generates unique 7-character slugs", async () => {
  const slugs = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const b: any = await (await create({ url: `https://example.com/${i}` })).json();
    expect(b.slug).toMatch(/^[a-z0-9]{7}$/);
    slugs.add(b.slug);
  }
  expect(slugs.size).toBe(20);
});
it("validates input", async () => {
  for (const b of [{}, { url: "ftp://x.test/" }, { url: "not a url" }, { url: "https://x.test/" + "a".repeat(2040) }, { url: "https://x.test/", slug: "AB" }, { url: "https://x.test/", slug: "ab" }, { url: "https://x.test/", slug: "a".repeat(33) }, { url: "https://x.test/", slug: "api" }, { url: "https://x.test/", slug: "no_underscores" }]) {
    expect((await create(b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
  }
  await create({ url: "https://x.test/", slug: "taken" });
  expect((await create({ url: "https://y.test/", slug: "taken" })).status).toBe(409);
});
it("a full batch of 100 clicks is stored", async () => {
  await create({ url: "https://example.com/busy", slug: "busy" });
  const countries = ["DE", "NG", "US", "JP"];
  expect(await consume(Array.from({ length: 100 }, (_, i) => ({ slug: "busy", country: countries[i % 4], at: Date.now() })))).toBe(true);
  const s = await stats("busy");
  expect(s.status).toBe(200);
  expect(s.body).toEqual({ slug: "busy", clicks: 100, countries: { DE: 25, NG: 25, US: 25, JP: 25 } });
});
it("a visit reaches the stats through the queue", async () => {
  await create({ url: "https://example.com/e2e", slug: "e2e-link" });
  expect((await stats("e2e-link")).body).toEqual({ slug: "e2e-link", clicks: 0, countries: {} });
  await f("/e2e-link", { redirect: "manual", cf: { country: "KE" } });
  await f("/e2e-link", { redirect: "manual" });
  let s = await stats("e2e-link");
  for (let i = 0; i < 50 && s.body?.clicks !== 2; i++) { await new Promise((r) => setTimeout(r, 200)); s = await stats("e2e-link"); }
  expect(s.body).toEqual({ slug: "e2e-link", clicks: 2, countries: { KE: 1, XX: 1 } });
}, 20000);
it("deleting needs the admin token", async () => {
  await create({ url: "https://example.com/del", slug: "gone-soon" });
  expect((await f("/api/links/gone-soon", { method: "DELETE" })).status).toBe(401);
  expect((await f("/api/links/gone-soon", { method: "DELETE", headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
  expect((await f("/api/links/gone-soon", { method: "DELETE", headers: { Authorization: "Bearer bench-admin-token" } })).status).toBe(204);
  expect((await f("/gone-soon", { redirect: "manual" })).status).toBe(404);
  expect((await stats("gone-soon")).status).toBe(404);
  expect((await stats("never-made")).status).toBe(404);
});
