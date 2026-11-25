interface Env { DB: D1Database }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { from, to, amount } = (await req.json()) as any;
    if (typeof from !== "string" || typeof to !== "string" || from === to || !Number.isInteger(amount) || amount <= 0) return Response.json({ error: "bad" }, { status: 400 });
    const a = await env.DB.prepare("SELECT balance FROM accounts WHERE id = ?").bind(from).first<{ balance: number }>();
    if (!a) return Response.json({ error: "nf" }, { status: 404 });
    if (a.balance < amount) return Response.json({ error: "insufficient funds" }, { status: 409 });
    await env.DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").bind(amount, from).run();
    const r = await env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").bind(amount, to).run();
    if (!r.meta.changes) return Response.json({ error: "nf" }, { status: 404 });
    const x = await env.DB.prepare("SELECT balance FROM accounts WHERE id = ?").bind(from).first<{ balance: number }>();
    const y = await env.DB.prepare("SELECT balance FROM accounts WHERE id = ?").bind(to).first<{ balance: number }>();
    return Response.json({ from: { id: from, balance: x!.balance }, to: { id: to, balance: y!.balance } });
  },
};
