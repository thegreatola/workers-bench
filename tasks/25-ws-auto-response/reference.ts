import { DurableObject } from "cloudflare:workers";
interface Env { LOBBY: DurableObjectNamespace<Lobby> }
export class Lobby extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async fetch(req: Request): Promise<Response> {
    const name = new URL(req.url).searchParams.get("name")!;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const { name } = ws.deserializeAttachment() as { name: string };
    const out = JSON.stringify({ from: name, text: message });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out);
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> { ws.close(code, reason); }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/lobby") return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!url.searchParams.get("name")) return new Response("name required", { status: 400 });
    return env.LOBBY.get(env.LOBBY.idFromName("main")).fetch(req);
  },
};
