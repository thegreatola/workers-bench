import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const greet = (name: string, tenant?: string) => exports.default.fetch(new Request(`http://w.test/greet/${name}`, { headers: tenant ? { "X-Tenant": tenant } : {} }));

it("passes the tenant as props", async () => {
  const r = await greet("Ada", "acme");
  expect(r.status).toBe(200);
  expect(await r.text()).toBe("Hello, Ada, from acme");
});
it("defaults to public", async () => {
  expect(await (await greet("Lin")).text()).toBe("Hello, Lin, from public");
});
it("Greeter reads ctx.props", async () => {
  const g = (exports as any).Greeter({ props: { tenant: "direct" } });
  expect(await g.greet("Sam")).toBe("Hello, Sam, from direct");
});
