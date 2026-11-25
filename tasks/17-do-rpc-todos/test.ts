import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const TODOS = (env as any).TODOS as DurableObjectNamespace<any>;
const list = (name: string) => TODOS.get(TODOS.idFromName(name)) as any;

it("add and list over RPC", async () => {
  const l = list("groceries");
  expect(await l.add("milk")).toEqual({ id: 1, text: "milk", done: false });
  expect(await l.add("eggs")).toEqual({ id: 2, text: "eggs", done: false });
  expect(await l.list()).toEqual([{ id: 1, text: "milk", done: false }, { id: 2, text: "eggs", done: false }]);
});
it("complete and remove", async () => {
  const l = list("chores");
  await l.add("a"); await l.add("b"); await l.add("c");
  expect(await l.complete(2)).toBe(true);
  expect(await l.complete(99)).toBe(false);
  expect(await l.remove(1)).toBe(true);
  expect(await l.remove(1)).toBe(false);
  expect(await l.list()).toEqual([{ id: 2, text: "b", done: true }, { id: 3, text: "c", done: false }]);
  expect((await l.add("d")).id).toBe(4);
});
it("lists are separate", async () => {
  await list("one").add("x");
  expect(await list("two").list()).toEqual([]);
  expect((await list("two").add("y")).id).toBe(1);
});
it("todos are in SQLite storage", async () => {
  await list("sql").add("stored");
  const found = await runInDurableObject(list("sql"), async (_i: unknown, state: DurableObjectState) => {
    const tables = state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'").toArray();
    return tables.some((t) => state.storage.sql.exec(`SELECT * FROM "${t.name}"`).toArray().some((r) => Object.values(r).includes("stored")));
  });
  expect(found).toBe(true);
});
it("fetch shows a list", async () => {
  await list("web").add("visible");
  const r = await exports.default.fetch(new Request("http://w.test/lists/web"));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ todos: [{ id: 1, text: "visible", done: false }] });
});
