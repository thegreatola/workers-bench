import { DurableObject } from "cloudflare:workers";
interface Env { ROOMS: DurableObjectNamespace<ChatRoom> }
export class ChatRoom extends DurableObject<Env> {
  async fetch(_req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "welcome", count: this.ctx.getWebSockets().length }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const out = JSON.stringify({ type: "message", text: message });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out);
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/rooms\/([^/]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(decodeURIComponent(m[1]))).fetch(req);
  },
};
