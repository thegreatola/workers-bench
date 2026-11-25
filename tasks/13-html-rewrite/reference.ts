export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/rewrite") return new Response("not found", { status: 404 });
    const res = new Response(req.body, { headers: { "Content-Type": "text/html" } });
    return new HTMLRewriter()
      .on("a", {
        element(el) {
          const href = el.getAttribute("href");
          if (href?.startsWith("http://")) el.setAttribute("href", "https://" + href.slice(7));
          if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
        },
      })
      .on("script", { element(el) { el.remove(); } })
      .transform(res);
  },
};
