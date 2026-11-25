import { exports, env } from "cloudflare:workers";
import { it, expect, beforeEach } from "vitest";
const DB = (env as any).DB as D1Database;
const imp = (csv: string) => exports.default.fetch(new Request("http://w.test/import", { method: "POST", body: csv, headers: { "content-type": "text/csv" } }));
const product = async (sku: string) => { const r = await exports.default.fetch(new Request(`http://w.test/products/${sku}`)); return r.status === 200 ? r.json() : r.status; };
const count = async () => (await DB.prepare("SELECT COUNT(*) AS n FROM products").first<{ n: number }>())!.n;

beforeEach(async () => {
  await DB.prepare("CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL)").run();
  await DB.prepare("DELETE FROM products").run();
});

it("imports quoted fields and exact cents", async () => {
  const csv = 'sku,name,price\r\nA-1,"Desk, oak",129.99\r\nB-2,"The ""Pro"" lamp",0.29\r\nC-3,"Two\nlines",12.5\r\nD-4,Plain,7\r\n';
  const r = await imp(csv);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ imported: 4 });
  expect(await product("A-1")).toEqual({ sku: "A-1", name: "Desk, oak", price_cents: 12999 });
  expect(await product("B-2")).toEqual({ sku: "B-2", name: 'The "Pro" lamp', price_cents: 29 });
  expect(await product("C-3")).toEqual({ sku: "C-3", name: "Two\nlines", price_cents: 1250 });
  expect(await product("D-4")).toEqual({ sku: "D-4", name: "Plain", price_cents: 700 });
  expect(await product("Z-9")).toBe(404);
});
it("prices are exact to the cent", async () => {
  const prices = ["0.29", "0.57", "1.15", "4.35", "19.99", "64.10", "1005.99", "0.07"];
  const cents = [29, 57, 115, 435, 1999, 6410, 100599, 7];
  const csv = "sku,name,price\n" + prices.map((p, i) => `P-${i},n,${p}`).join("\n");
  expect((await imp(csv)).status).toBe(200);
  for (const [i, p] of prices.entries()) expect(((await product(`P-${i}`)) as any).price_cents, p).toBe(cents[i]);
});
it("a large file imports in full", async () => {
  const rows = Array.from({ length: 2000 }, (_, i) => `SKU-${i},Item ${i},${(i % 500) + 0.99}`);
  const r = await imp("sku,name,price\n" + rows.join("\n") + "\n");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ imported: 2000 });
  expect(await count()).toBe(2000);
  expect(await product("SKU-1999")).toEqual({ sku: "SKU-1999", name: "Item 1999", price_cents: 49999 });
}, 30000);
it("updates existing products", async () => {
  await imp("sku,name,price\nU-1,Old,1\n");
  await imp("sku,name,price\nU-1,New,2.5\n");
  expect(await product("U-1")).toEqual({ sku: "U-1", name: "New", price_cents: 250 });
  expect(await count()).toBe(1);
});
it("any invalid row changes nothing and every error is listed", async () => {
  await imp("sku,name,price\nKEEP-1,Kept,1\n");
  const csv = 'sku,name,price\nOK-1,Fine,1\nbad sku,x,1\n"Q-1","multi\nline",1\nOK-2,,2\nOK-3,x,1.999\nOK-1,dup,3\nOK-4,x,-1\nOK-5,x,abc\n';
  const r = await imp(csv);
  expect(r.status).toBe(422);
  const { errors } = (await r.json()) as any;
  expect(errors.map((e: any) => e.line)).toEqual([3, 6, 7, 8, 9, 10]);
  for (const e of errors) expect(typeof e.error).toBe("string");
  expect(await count()).toBe(1);
  expect(await product("OK-1")).toBe(404);
});
