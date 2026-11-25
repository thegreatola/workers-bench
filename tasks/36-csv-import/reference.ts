interface Env { DB: D1Database }
const j = (b: unknown, status = 200) => Response.json(b, { status });

/** RFC 4180 rows, each with the line it starts on. */
function parseCsv(text: string): { line: number; fields: string[] }[] {
  const rows: { line: number; fields: string[] }[] = [];
  let fields: string[] = [], field = "", quoted = false, line = 1, start = 1, i = 0, any = false;
  const endRow = () => { fields.push(field); rows.push({ line: start, fields }); fields = []; field = ""; any = false; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      if (c === "\n") line++;
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; any = true; i++; continue; }
    if (c === ",") { fields.push(field); field = ""; any = true; i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") { i++; continue; }
    if (c === "\n") { endRow(); line++; start = line; i++; continue; }
    field += c; any = true; i++;
  }
  if (any || field !== "" || fields.length) endRow();
  return rows;
}
/** Whole cents from a decimal string, without floating point. */
function cents(p: string): number | null {
  const m = p.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/import" && req.method === "POST") {
      const rows = parseCsv(await req.text());
      const [header, ...data] = rows;
      if (!header || header.fields.join(",") !== "sku,name,price") return j({ errors: [{ line: 1, error: "header must be sku,name,price" }] }, 422);
      const errors: { line: number; error: string }[] = [];
      const seen = new Set<string>();
      const products: [string, string, number][] = [];
      for (const r of data) {
        const [sku, name, price] = r.fields;
        const c = price === undefined ? null : cents(price);
        let err = "";
        if (r.fields.length !== 3) err = "expected 3 fields";
        else if (!/^[A-Z0-9-]{1,32}$/.test(sku)) err = "invalid sku";
        else if (seen.has(sku)) err = "duplicate sku";
        else if (name.length < 1 || name.length > 200) err = "invalid name";
        else if (c === null) err = "invalid price";
        if (err) errors.push({ line: r.line, error: err });
        else { seen.add(sku); products.push([sku, name, c!]); }
      }
      if (errors.length) return j({ errors }, 422);
      // One statement per row, in batches: D1 allows at most 100 bound parameters per statement.
      const stmt = env.DB.prepare("INSERT INTO products (sku, name, price_cents) VALUES (?, ?, ?) ON CONFLICT(sku) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents");
      await env.DB.batch(products.map((p) => stmt.bind(...p)));
      return j({ imported: products.length });
    }
    const m = pathname.match(/^\/products\/([^/]+)$/);
    if (m && req.method === "GET") {
      const row = await env.DB.prepare("SELECT sku, name, price_cents FROM products WHERE sku = ?").bind(decodeURIComponent(m[1])).first();
      return row ? j(row) : j({ error: "not found" }, 404);
    }
    return j({ error: "not found" }, 404);
  },
};
