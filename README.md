# workers-bench

How well do AI coding agents write Cloudflare Workers, and does giving them Cloudflare's documentation help?

Each task is a short spec for a Worker, with the bindings it gets in `wrangler.jsonc`. An agent writes `src/index.ts`, and hidden tests grade it inside workerd, the Workers runtime, through Cloudflare's Vitest plugin. Nothing is deployed, and grading needs no Cloudflare account.

## Tasks

20 tasks, each with hidden tests and a reference solution:

| | Tasks |
|---|---|
| HTTP | JSON and methods, routing, CORS, Server-Sent Events, signed webhooks (HMAC), HTMLRewriter, Cache API |
| Storage | KV (CRUD and TTL, listing past one page, `waitUntil` counters), R2 (files and ETags, range requests), D1 |
| Background | Cron triggers, Queues (producer, consumer, per-message retry) |
| Durable Objects | Counters, rate limiting, RPC with SQLite storage, alarms, WebSocket hibernation |

A task's spec states only what its tests check. `npm run check-tasks` proves each task is sound: its reference solution must pass every test, and an empty Worker must pass none.

## How a run works

```
task spec + wrangler.jsonc ──> agent (Claude Code, headless) ──> src/index.ts ──> hidden tests in workerd ──> score
                                file tools only;
                                "docs" adds Cloudflare's docs search
```

- **The agent** is Claude Code in headless mode, in a fresh temp folder holding only `TASK.md`, `wrangler.jsonc` and a stub `src/index.ts`. Its tools are Read, Write, Edit, Glob and Grep, confined to that folder. It can't run code, so a score measures writing a working Worker from the spec.
- **Two conditions:** `none` has no outside help. `docs` adds Cloudflare's documentation MCP server (`docs.mcp.cloudflare.com`), and the run counts how often the agent searches it.
- **Output** goes to `runs/<run id>/`: each attempt's code, its stream-json trace (which [agent-trace-viewer](https://github.com/thegreatola/agent-trace-viewer) opens), and `results.json`. `npm run report` turns that into a leaderboard and a task-by-task grid.

## Run it

Requires Node 22+ and a logged-in [Claude Code](https://docs.claude.com/en/docs/claude-code), which can run on a subscription without an API key.

```bash
npm install
npm run check-tasks                       # every reference passes, every empty Worker fails
npm run bench -- --models haiku,sonnet,opus --conditions none,docs --concurrency 4
npm run report -- <run id>
npm run regrade -- <run id>               # score saved code again after a test fix, no model calls
npm test                                  # unit tests, offline
```

`--tasks 01,15` runs a subset. `--run <name>` names the run folder.

## Results so far

| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches |
|---|---|---|---|---|---|
| Haiku | Cloudflare docs search | 20/20 | 94/94 | 12 s | 0 |
| Haiku | no docs | 20/20 | 94/94 | 13 s | – |

The smallest model solves every task with or without docs, and never searches the docs. These 20 tasks cover APIs that are well documented and widely used, so they can't tell models apart or show what documentation is worth. They stay as the baseline tier.

One grading bug was found this way: Haiku put its `cache.put` in `ctx.waitUntil`, a correct pattern that the cache test read too early. The test now waits for the write, and `regrade` rescored the run.

## Status

The harness, the 20 baseline tasks and the first run are done. Next is a harder tier built on newer Workers APIs, where a model's training data is thinnest and the docs should matter most.

## License

MIT
