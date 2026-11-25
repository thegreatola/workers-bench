import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const LOBBY = (env as any).LOBBY as DurableObjectNamespace;
const main = () => LOBBY.get(LOBBY.idFromName("main"));

async function join(name: string) {
  const r = await exports.default.fetch(new Request(`http://w.test/lobby?name=${encodeURIComponent(name)}`, { headers: { Upgrade: "websocket" } }));
  expect(r.status).toBe(101);
  const ws = r.webSocket!;
  const inbox: string[] = [];
  const waiters: ((v: string) => void)[] = [];
  ws.accept();
  ws.addEventListener("message", (e) => { const w = waiters.shift(); w ? w(e.data as string) : inbox.push(e.data as string); });
  const next = () => inbox.length ? Promise.resolve(inbox.shift()!) : new Promise<string>((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error("no message within 2 s")), 2000); });
  return { ws, inbox, next };
}
const settle = () => new Promise((r) => setTimeout(r, 150));

it("rejects bad requests", async () => {
  expect((await exports.default.fetch(new Request("http://w.test/lobby?name=x"))).status).toBe(426);
  expect((await exports.default.fetch(new Request("http://w.test/lobby", { headers: { Upgrade: "websocket" } }))).status).toBe(400);
});
it("ping gets pong", async () => {
  const a = await join("ana");
  a.ws.send("ping");
  expect(await a.next()).toBe("pong");
});
it("pong is an automatic response", async () => {
  await join("auto");
  const pair = await runInDurableObject(main(), (_i: unknown, s: DurableObjectState) => {
    const p = s.getWebSocketAutoResponse();
    return p ? { request: p.request, response: p.response } : null;
  });
  expect(pair).toEqual({ request: "ping", response: "pong" });
});
it("names live in socket attachments", async () => {
  await join("zed");
  const names = await runInDurableObject(main(), (_i: unknown, s: DurableObjectState) =>
    s.getWebSockets().map((w) => JSON.stringify(w.deserializeAttachment() ?? null)));
  expect(names.some((n) => n.includes('"zed"'))).toBe(true);
});
it("messages carry the sender's name", async () => {
  const a = await join("amy");
  const b = await join("bo");
  await settle();
  b.inbox.length = 0;
  a.ws.send("hi all");
  expect(JSON.parse(await b.next())).toEqual({ from: "amy", text: "hi all" });
  await settle();
  expect(a.inbox.filter((m) => m.includes("hi all"))).toEqual([]);
});
