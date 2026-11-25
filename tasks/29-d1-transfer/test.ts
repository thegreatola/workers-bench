import { exports, env } from "cloudflare:workers";
import { it, expect, beforeEach } from "vitest";
const DB = (env as any).DB as D1Database;
const send = (body: unknown) => exports.default.fetch(new Request("http://w.test/transfers", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const bal = async (id: string) => (await DB.prepare("SELECT balance FROM accounts WHERE id = ?").bind(id).first<{ balance: number }>())?.balance;
const total = async () => (await DB.prepare("SELECT SUM(balance) AS s FROM accounts").first<{ s: number }>())!.s;

beforeEach(async () => {
  await DB.prepare("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL)").run();
  await DB.prepare("DELETE FROM accounts").run();
  await DB.batch([["ann", 100], ["bob", 50], ["cy", 0]].map(([id, b]) => DB.prepare("INSERT INTO accounts (id, balance) VALUES (?, ?)").bind(id, b)));
});

it("moves money", async () => {
  const r = await send({ from: "ann", to: "bob", amount: 30 });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ from: { id: "ann", balance: 70 }, to: { id: "bob", balance: 80 } });
});
it("insufficient funds changes nothing", async () => {
  const r = await send({ from: "bob", to: "ann", amount: 51 });
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "insufficient funds" });
  expect([await bal("ann"), await bal("bob")]).toEqual([100, 50]);
});
it("a missing account is 404 and no money is lost", async () => {
  for (const b of [{ from: "ann", to: "ghost", amount: 10 }, { from: "ghost", to: "ann", amount: 10 }]) {
    expect((await send(b)).status, JSON.stringify(b)).toBe(404);
  }
  expect(await bal("ann")).toBe(100);
  expect(await total()).toBe(150);
});
it("bad input is 400", async () => {
  for (const b of [{}, { from: "ann", to: "ann", amount: 1 }, { from: "ann", to: "bob", amount: 0 }, { from: "ann", to: "bob", amount: 1.5 }, { from: "ann", to: "bob", amount: "5" }]) {
    expect((await send(b)).status, JSON.stringify(b)).toBe(400);
  }
  expect(await total()).toBe(150);
});
it("concurrent transfers never overdraw", async () => {
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => send({ from: "ann", to: i % 2 ? "bob" : "cy", amount: 10 })));
  const codes = rs.map((r) => r.status);
  expect(codes.filter((c) => c === 200).length).toBe(10);
  expect(codes.filter((c) => c === 409).length).toBe(15);
  expect(await bal("ann")).toBe(0);
  expect(await total()).toBe(150);
});
