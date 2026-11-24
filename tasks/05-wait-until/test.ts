import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/index";
const STATS = (env as any).STATS as KVNamespace;

async function call(path: string) {
  const ctx = createExecutionContext();
  let waited = false;
  const orig = ctx.waitUntil.bind(ctx);
  ctx.waitUntil = (p: Promise<unknown>) => { waited = true; orig(p); };
  const res = await (worker as any).fetch(new Request("http://w.test" + path), env, ctx);
  const text = await res.text();
  await waitOnExecutionContext(ctx);
  return { res, text, waited };
}

it("hit answers ok and counts through waitUntil", async () => {
  const { res, text, waited } = await call("/hit/home");
  expect(res.status).toBe(200);
  expect(text).toBe("ok");
  expect(waited).toBe(true);
  expect(await STATS.get("count:home")).toBe("1");
});
it("counts add up", async () => {
  for (let i = 0; i < 3; i++) await call("/hit/about");
  expect((await call("/count/about")).text).toBe("3");
});
it("unknown page counts 0", async () => {
  const { res, text } = await call("/count/nowhere");
  expect(res.status).toBe(200);
  expect(text).toBe("0");
});
