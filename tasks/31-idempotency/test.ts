import { exports, env } from "cloudflare:workers";
import { it, expect, beforeAll } from "vitest";
const DB = (env as any).DB as D1Database;
const pay = (key: string | null, body: unknown) => exports.default.fetch(new Request("http://w.test/payments", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) } }));
const count = async () => (await DB.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n;

beforeAll(async () => {
  await DB.prepare("CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER NOT NULL, currency TEXT NOT NULL)").run();
});

it("creates once and replays", async () => {
  const before = await count();
  const a = await pay("k-1", { amount: 500, currency: "USD" });
  expect(a.status).toBe(201);
  const first: any = await a.json();
  expect(first).toMatchObject({ amount: 500, currency: "USD" });
  expect(typeof first.id).toBe("number");
  const b = await pay("k-1", { amount: 500, currency: "USD" });
  expect(b.status).toBe(201);
  expect(await b.json()).toEqual(first);
  expect(await count()).toBe(before + 1);
});
it("a reused key with another body is 422", async () => {
  await pay("k-2", { amount: 100, currency: "EUR" });
  const before = await count();
  const r = await pay("k-2", { amount: 999, currency: "EUR" });
  expect(r.status).toBe(422);
  expect(await r.json()).toEqual({ error: "idempotency key reused" });
  expect(await count()).toBe(before);
});
it("different keys make different payments", async () => {
  const a: any = await (await pay("k-3a", { amount: 1, currency: "USD" })).json();
  const b: any = await (await pay("k-3b", { amount: 1, currency: "USD" })).json();
  expect(a.id).not.toBe(b.id);
});
it("rejects bad requests without creating anything", async () => {
  const before = await count();
  expect((await pay(null, { amount: 5, currency: "USD" })).status).toBe(400);
  for (const b of [{}, { amount: 0, currency: "USD" }, { amount: 5, currency: "GBP" }, { amount: 2.5, currency: "USD" }]) {
    expect((await pay(`bad-${JSON.stringify(b)}`, b)).status, JSON.stringify(b)).toBe(400);
  }
  expect(await count()).toBe(before);
});
it("a burst of identical retries makes one payment", async () => {
  const before = await count();
  const rs = await Promise.all(Array.from({ length: 30 }, () => pay("k-burst", { amount: 42, currency: "EUR" })));
  expect(rs.map((r) => r.status)).toEqual(Array(30).fill(201));
  const bodies = await Promise.all(rs.map((r) => r.json()));
  for (const b of bodies) expect(b).toEqual(bodies[0]);
  expect(await count()).toBe(before + 1);
});
