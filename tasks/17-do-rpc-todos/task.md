Write to-do lists as a Durable Object called over RPC, not `fetch`. Export a class `TodoList` that extends `DurableObject` from `cloudflare:workers`, bound as `TODOS`. Each list name is one object, reached with `env.TODOS.get(env.TODOS.idFromName(name))`.

The class has these RPC methods. A todo is `{"id": number, "text": string, "done": boolean}`, and ids start at 1 for each list.

- `add(text: string): Promise<Todo>` adds a todo that isn't done.
- `list(): Promise<Todo[]>` returns every todo, ordered by id.
- `complete(id: number): Promise<boolean>` marks it done. Returns false when there's no such id.
- `remove(id: number): Promise<boolean>` deletes it. Returns false when there's no such id. Ids are never reused.

Use the Durable Object's SQLite storage (`ctx.storage.sql`) so todos survive restarts. The Worker's `fetch` also answers `GET /lists/:name` with the list as JSON `{"todos": [...]}`.
