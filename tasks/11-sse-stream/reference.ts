export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/events") return new Response("not found", { status: 404 });
    const c = url.searchParams.get("count") ?? "3";
    if (!/^\d+$/.test(c) || +c < 1 || +c > 50) return new Response("bad count", { status: 400 });
    const n = +c;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    (async () => {
      for (let i = 1; i <= n; i++) await writer.write(enc.encode(`id: ${i}\nevent: tick\ndata: ${JSON.stringify({ i })}\n\n`));
      await writer.write(enc.encode("event: done\ndata: {}\n\n"));
      await writer.close();
    })();
    return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  },
};
