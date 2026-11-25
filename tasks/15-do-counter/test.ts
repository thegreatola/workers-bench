import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, method = "GET") => exports.default.fetch(new Request("http://w.test" + path, { method }));

it("starts at zero and increments", async () => {
  expect(await (await f("/counter/a")).json()).toEqual({ name: "a", value: 0 });
  expect(await (await f("/counter/a/increment", "POST")).json()).toEqual({ name: "a", value: 1 });
  expect(await (await f("/counter/a/increment?by=5", "POST")).json()).toEqual({ name: "a", value: 6 });
  expect(await (await f("/counter/a/increment?by=-2", "POST")).json()).toEqual({ name: "a", value: 4 });
  expect(await (await f("/counter/a")).json()).toEqual({ name: "a", value: 4 });
});
it("names are separate", async () => {
  await f("/counter/x/increment", "POST");
  await f("/counter/x/increment", "POST");
  await f("/counter/y/increment", "POST");
  expect(((await (await f("/counter/x")).json()) as any).value).toBe(2);
  expect(((await (await f("/counter/y")).json()) as any).value).toBe(1);
});
it("reset", async () => {
  await f("/counter/r/increment?by=9", "POST");
  expect(await (await f("/counter/r/reset", "POST")).json()).toEqual({ name: "r", value: 0 });
  expect(((await (await f("/counter/r")).json()) as any).value).toBe(0);
});
it("bad by is 400", async () => {
  for (const b of ["abc", "1.5", ""]) expect((await f(`/counter/b/increment?by=${b}`, "POST")).status, b).toBe(400);
});
it("concurrent increments are not lost", async () => {
  await Promise.all(Array.from({ length: 40 }, () => f("/counter/busy/increment", "POST")));
  expect(((await (await f("/counter/busy")).json()) as any).value).toBe(40);
});
it("the count lives in durable storage", async () => {
  await f("/counter/durable/increment?by=7", "POST");
  const env = (await import("cloudflare:workers")).env as any;
  const { runInDurableObject } = await import("cloudflare:test");
  const stub = env.COUNTER.get(env.COUNTER.idFromName("durable"));
  const stored = await runInDurableObject(stub, async (_i: unknown, state: DurableObjectState) => {
    const kv = [...(await state.storage.list()).values()];
    let sql: unknown[] = [];
    try {
      for (const t of state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'").toArray())
        sql.push(...state.storage.sql.exec(`SELECT * FROM "${t.name}"`).toArray().flatMap((r) => Object.values(r)));
    } catch {}
    return [...kv, ...sql];
  });
  expect(stored.map(Number)).toContain(7);
});
