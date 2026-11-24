import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string, init?: RequestInit) => exports.default.fetch(new Request("http://w.test" + path, init));
const OK = "https://admin.example.com";

it("GET with an allowed origin", async () => {
  const r = await f("/data", { headers: { Origin: OK } });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ data: 42 });
  expect(r.headers.get("access-control-allow-origin")).toBe(OK);
  expect(r.headers.get("vary") ?? "").toMatch(/origin/i);
});
it("GET with a disallowed origin has no ACAO", async () => {
  const r = await f("/data", { headers: { Origin: "https://evil.example.com" } });
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});
it("GET without origin has no ACAO", async () => {
  const r = await f("/data");
  expect(await r.json()).toEqual({ data: 42 });
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});
it("a lookalike origin is not allowed", async () => {
  const r = await f("/data", { headers: { Origin: "https://app.example.com.evil.net" } });
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});
it("preflight from an allowed origin", async () => {
  const r = await f("/data", { method: "OPTIONS", headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, x-api-key" } });
  expect(r.status).toBe(204);
  expect(r.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  expect(r.headers.get("access-control-allow-methods")?.replace(/\s/g, "")).toBe("GET,POST,OPTIONS");
  expect(r.headers.get("access-control-allow-headers")?.replace(/\s/g, "").toLowerCase()).toBe("content-type,x-api-key");
  expect(r.headers.get("access-control-max-age")).toBe("86400");
  expect(r.headers.get("vary") ?? "").toMatch(/origin/i);
});
it("preflight from a disallowed origin is 403", async () => {
  const r = await f("/data", { method: "OPTIONS", headers: { Origin: "https://evil.example.com" } });
  expect(r.status).toBe(403);
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});
it("other paths are 404", async () => {
  expect((await f("/other")).status).toBe(404);
});
