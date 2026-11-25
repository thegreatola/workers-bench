export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/highlight") return new Response("not found", { status: 404 });
    let buf = "";
    const rewriter = new HTMLRewriter().on("p", {
      text(t) {
        buf += t.text;
        if (!t.lastInTextNode) { t.remove(); return; }
        t.replace(buf.split("Workers").join("<mark>Workers</mark>"), { html: true });
        buf = "";
      },
    });
    return rewriter.transform(new Response(req.body, { headers: { "Content-Type": "text/html" } }));
  },
};
