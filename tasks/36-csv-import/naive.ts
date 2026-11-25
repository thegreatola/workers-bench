interface Env { DB: D1Database }
const j = (b: unknown, status = 200) => Response.json(b, { status });
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/import" && req.method === "POST") {
      const lines = (await req.text()).split(/\r?\n/).filter((l) => l);
      const errors: { line: number; error: string }[] = [];
      const products: [string, string, number][] = [];
      const seen = new Set<string>();
      lines.slice(1).forEach((l, i) => {
        const [sku, name, price] = l.split(",").map((x) => x.replace(/^"|"$/g, ""));
        if (!/^[A-Z0-9-]{1,32}$/.test(sku ?? "") || seen.has(sku) || !name || !/^\d+(\.\d{1,2})?$/.test(price ?? "")) errors.push({ line: i + 2, error: "invalid row" });
        else { seen.add(sku); products.push([sku, name, Math.floor(parseFloat(price) * 100)]); }
      });
      if (errors.length) return j({ errors }, 422);
      for (let i = 0; i < products.length; i += 500) {
        const chunk = products.slice(i, i + 500);
        await env.DB.prepare(`INSERT OR REPLACE INTO products (sku, name, price_cents) VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`).bind(...chunk.flat()).run();
      }
      return j({ imported: products.length });
    }
    const m = pathname.match(/^\/products\/([^/]+)$/);
    if (m) { const row = await env.DB.prepare("SELECT sku, name, price_cents FROM products WHERE sku = ?").bind(m[1]).first(); return row ? j(row) : j({ error: "nf" }, 404); }
    return j({ error: "nf" }, 404);
  },
};
