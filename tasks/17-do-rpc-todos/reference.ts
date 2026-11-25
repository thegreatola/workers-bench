import { DurableObject } from "cloudflare:workers";
interface Env { TODOS: DurableObjectNamespace<TodoList> }
interface Todo { id: number; text: string; done: boolean }
export class TodoList extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0)");
  }
  async add(text: string): Promise<Todo> {
    const r = this.ctx.storage.sql.exec<{ id: number }>("INSERT INTO todos (text) VALUES (?) RETURNING id", text).one();
    return { id: r.id, text, done: false };
  }
  async list(): Promise<Todo[]> {
    return this.ctx.storage.sql.exec<{ id: number; text: string; done: number }>("SELECT id, text, done FROM todos ORDER BY id").toArray().map((r) => ({ id: r.id, text: r.text, done: !!r.done }));
  }
  async complete(id: number): Promise<boolean> { return this.ctx.storage.sql.exec("UPDATE todos SET done = 1 WHERE id = ?", id).rowsWritten > 0; }
  async remove(id: number): Promise<boolean> { return this.ctx.storage.sql.exec("DELETE FROM todos WHERE id = ?", id).rowsWritten > 0; }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/lists\/([^/]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    return Response.json({ todos: await env.TODOS.get(env.TODOS.idFromName(decodeURIComponent(m[1]))).list() });
  },
};
