import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const f = (path: string) => exports.default.fetch(new Request("http://w.test" + path));
const secured = (r: Response) => {
  expect(r.headers.get("x-frame-options")).toBe("DENY");
  expect(r.headers.get("content-security-policy")).toBe("default-src 'self'");
};

it("health check", async () => {
  const r = await f("/api/health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});
it("unknown API paths are JSON 404s", async () => {
  for (const p of ["/api/nope", "/api/health/extra"]) {
    const r = await f(p);
    expect(r.status, p).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  }
});
it("the app shell has security headers", async () => {
  const r = await f("/");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("app shell");
  secured(r);
});
it("assets are served with headers", async () => {
  const r = await f("/app.js");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("loaded");
  secured(r);
});
it("app routes fall back to the shell", async () => {
  const r = await f("/settings/profile");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("app shell");
  secured(r);
});
