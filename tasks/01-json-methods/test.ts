import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));

it("GET / returns ok JSON", async () => {
  const r = await f("/");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await r.json()).toEqual({ status: "ok", path: "/" });
});
it("GET echoes a nested path", async () => {
  expect(await (await f("/a/b/c?x=1")).json()).toEqual({ status: "ok", path: "/a/b/c" });
});
it("HEAD has headers and no body", async () => {
  const r = await f("/x", { method: "HEAD" });
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await r.text()).toBe("");
});
it("POST is 405 with Allow", async () => {
  const r = await f("/", { method: "POST", body: "x" });
  expect(r.status).toBe(405);
  expect(r.headers.get("allow")?.replace(/\s/g, "")).toBe("GET,HEAD");
  expect(await r.text()).toBe("");
});
it("DELETE is 405", async () => {
  expect((await f("/a", { method: "DELETE" })).status).toBe(405);
});
