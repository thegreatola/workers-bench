import { WorkerEntrypoint } from "cloudflare:workers";
interface Props { tenant: string }
export class Greeter extends WorkerEntrypoint<unknown, Props> {
  greet(name: string): string { return `Hello, ${name}, from ${this.ctx.props.tenant}`; }
}
export default {
  async fetch(req: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/greet\/([^/]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const tenant = req.headers.get("X-Tenant") ?? "public";
    const g = (ctx as any).exports.Greeter({ props: { tenant } });
    return new Response(await g.greet(decodeURIComponent(m[1])));
  },
};
