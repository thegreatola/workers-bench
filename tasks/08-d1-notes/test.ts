import { exports, env } from "cloudflare:workers";
import { it, expect, beforeAll } from "vitest";
const DB = (env as any).DB as D1Database;
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));
const post = (body: unknown) => f("/notes", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeAll(async () => {
  await DB.prepare("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)").run();
});

it("create and fetch", async () => {
  const r = await post({ text: "first" });
  expect(r.status).toBe(201);
  const n: any = await r.json();
  expect(n.text).toBe("first");
  expect(typeof n.id).toBe("number");
  const g = await f(`/notes/${n.id}`);
  expect(g.status).toBe(200);
  expect(await g.json()).toEqual({ id: n.id, text: "first" });
});
it("text is stored exactly, quotes and all", async () => {
  const evil = `x'); DROP TABLE notes; --`;
  const n: any = await (await post({ text: evil })).json();
  expect((await DB.prepare("SELECT text FROM notes WHERE id = ?").bind(n.id).first<{ text: string }>())?.text).toBe(evil);
  expect((await f("/notes")).status).toBe(200);
});
it("validation", async () => {
  for (const b of [{}, { text: "" }, { text: "   " }, { text: 5 }]) {
    const r = await post(b);
    expect(r.status, JSON.stringify(b)).toBe(400);
    expect(typeof ((await r.json()) as any).error).toBe("string");
  }
});
it("list is ordered and limited", async () => {
  for (let i = 0; i < 25; i++) await post({ text: `n${i}` });
  const all: any = await (await f("/notes")).json();
  expect(all.notes.length).toBe(20);
  const ids = all.notes.map((n: any) => n.id);
  expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
  const three: any = await (await f("/notes?limit=3")).json();
  expect(three.notes.length).toBe(3);
  expect(three.notes[0]).toEqual({ id: ids[0], text: all.notes[0].text });
  for (const l of ["0", "101", "abc"]) expect((await f(`/notes?limit=${l}`)).status, l).toBe(400);
});
it("delete and 404s", async () => {
  const n: any = await (await post({ text: "bye" })).json();
  expect((await f(`/notes/${n.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await f(`/notes/${n.id}`)).status).toBe(404);
  expect((await f(`/notes/${n.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await f("/notes/999999")).status).toBe(404);
});
