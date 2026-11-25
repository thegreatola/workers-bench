interface Env { STORE: KVNamespace }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/keys") return new Response("not found", { status: 404 });
    const prefix = url.searchParams.get("prefix") ?? undefined;
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.STORE.list({ prefix, cursor });
      keys.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    keys.sort();
    return Response.json({ count: keys.length, keys });
  },
};
