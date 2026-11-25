Write a Worker that calls one of its own entrypoints through `ctx.exports`, with no service binding.

- Export a class `Greeter` that extends `WorkerEntrypoint` from `cloudflare:workers`. Its RPC method `greet(name: string): string` returns `Hello, <name>, from <tenant>`, where `<tenant>` is the `tenant` property this entrypoint was given through `ctx.props`.
- `GET /greet/:name` reads the `X-Tenant` request header (default `public`), gets a `Greeter` from `ctx.exports` with `props: {"tenant": <that tenant>}`, calls `greet`, and returns the result as plain text with status 200.
