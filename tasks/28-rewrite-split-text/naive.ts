export default {
  async fetch(req: Request): Promise<Response> {
    return new HTMLRewriter().on("p", {
      text(t) { if (t.text.includes("Workers")) t.replace(t.text.split("Workers").join("<mark>Workers</mark>"), { html: true }); },
    }).transform(new Response(req.body, { headers: { "Content-Type": "text/html" } }));
  },
};
