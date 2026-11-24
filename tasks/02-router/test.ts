import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));
const json = async (r: Response) => { expect(r.headers.get("content-type")).toMatch(/^application\/json/); return r.json(); };

it("GET /users/:id", async () => {
  const r = await f("/users/42");
  expect(r.status).toBe(200);
  expect(await json(r)).toEqual({ id: "42" });
});
it("non-digit id is 400", async () => {
  const r = await f("/users/abc");
  expect(r.status).toBe(400);
  expect(await json(r)).toEqual({ error: "invalid id" });
});
it("POST /echo returns the JSON", async () => {
  const body = { a: 1, b: [true, null, "x"], c: { d: 2 } };
  const r = await f("/echo", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  expect(r.status).toBe(200);
  expect(await json(r)).toEqual(body);
});
it("bad JSON is 400", async () => {
  const r = await f("/echo", { method: "POST", body: "{nope" });
  expect(r.status).toBe(400);
  expect(await json(r)).toEqual({ error: "invalid json" });
});
it("unknown routes are 404", async () => {
  for (const [p, m] of [["/nope", "GET"], ["/users/", "GET"], ["/users/12/extra", "GET"], ["/echo", "GET"], ["/users/1", "DELETE"]] as const) {
    const r = await f(p, { method: m });
    expect(r.status, `${m} ${p}`).toBe(404);
    expect(await json(r)).toEqual({ error: "not found" });
  }
});
