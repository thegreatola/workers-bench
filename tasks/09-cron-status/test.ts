import { env } from "cloudflare:workers";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../src/index";

async function status() {
  const ctx = createExecutionContext();
  const r = await (worker as any).fetch(new Request("http://w.test/status"), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(r.status).toBe(200);
  return r.json();
}
async function tick(at: Date) {
  const ctx = createExecutionContext();
  await (worker as any).scheduled(createScheduledController({ scheduledTime: at, cron: "*/5 * * * *" }), env, ctx);
  await waitOnExecutionContext(ctx);
}

it("status before, and after runs", async () => {
  expect(await status()).toEqual({ lastRun: null, runs: 0 });
  await tick(new Date("2026-01-02T03:05:00Z"));
  expect(await status()).toEqual({ lastRun: "2026-01-02T03:05:00.000Z", runs: 1 });
  await tick(new Date("2026-01-02T03:10:00Z"));
  await tick(new Date("2026-01-02T03:15:00Z"));
  expect(await status()).toEqual({ lastRun: "2026-01-02T03:15:00.000Z", runs: 3 });
});
