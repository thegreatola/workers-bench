import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { it, expect } from "vitest";
const ROOMS = (env as any).ROOMS as DurableObjectNamespace;

interface Client { ws: WebSocket; inbox: any[]; next(): Promise<any> }
async function connect(room: string): Promise<Client> {
  const r = await exports.default.fetch(new Request(`http://w.test/rooms/${room}`, { headers: { Upgrade: "websocket" } }));
  expect(r.status).toBe(101);
  const ws = r.webSocket!;
  const inbox: any[] = [];
  const waiters: ((v: any) => void)[] = [];
  ws.accept();
  ws.addEventListener("message", (e) => {
    const v = JSON.parse(e.data as string);
    const w = waiters.shift();
    w ? w(v) : inbox.push(v);
  });
  return {
    ws, inbox,
    next: () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error("no message within 2 s")), 2000); }),
  };
}
const settle = () => new Promise((r) => setTimeout(r, 150));

it("no upgrade header is 426", async () => {
  expect((await exports.default.fetch(new Request("http://w.test/rooms/x"))).status).toBe(426);
});
it("welcome counts the room", async () => {
  const a = await connect("count");
  expect(await a.next()).toEqual({ type: "welcome", count: 1 });
  const b = await connect("count");
  expect(await b.next()).toEqual({ type: "welcome", count: 2 });
});
it("messages go to others, not the sender", async () => {
  const a = await connect("chat"); await a.next();
  const b = await connect("chat"); await b.next();
  const c = await connect("chat"); await c.next();
  a.ws.send("hello");
  expect(await b.next()).toEqual({ type: "message", text: "hello" });
  expect(await c.next()).toEqual({ type: "message", text: "hello" });
  await settle();
  expect(a.inbox).toEqual([]);
});
it("rooms are separate", async () => {
  const a = await connect("r1"); await a.next();
  const b = await connect("r2"); await b.next();
  a.ws.send("only r1");
  await settle();
  expect(b.inbox).toEqual([]);
});
it("uses the hibernation API", async () => {
  const a = await connect("hib"); await a.next();
  const n = await runInDurableObject(ROOMS.get(ROOMS.idFromName("hib")), (_i: unknown, s: DurableObjectState) => s.getWebSockets().length);
  expect(n).toBe(1);
});
it("closed sockets drop out", async () => {
  const a = await connect("bye"); await a.next();
  const b = await connect("bye"); await b.next();
  b.ws.close(1000, "done");
  await settle();
  const c = await connect("bye");
  expect(await c.next()).toEqual({ type: "welcome", count: 2 });
  c.ws.send("still here?");
  expect(await a.next()).toEqual({ type: "message", text: "still here?" });
});
