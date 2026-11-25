# workers-bench

How well do AI coding agents write Cloudflare Workers, and does giving them Cloudflare's documentation help?

Each task is a short spec for a Worker, with the bindings it gets in `wrangler.jsonc`. An agent writes `src/index.ts`, and hidden tests grade it inside workerd, the Workers runtime, through Cloudflare's Vitest plugin. Nothing is deployed, and grading needs no Cloudflare account.

## Tasks

27 tasks, each with hidden tests and a reference solution, in two tiers.

**Baseline (01–20):** well-known Workers APIs.

| | Tasks |
|---|---|
| HTTP | JSON and methods, routing, CORS, Server-Sent Events, signed webhooks (HMAC), HTMLRewriter, Cache API |
| Storage | KV (CRUD and TTL, listing past one page, `waitUntil` counters), R2 (files and ETags, range requests), D1 |
| Background | Cron triggers, Queues (producer, consumer, per-message retry) |
| Durable Objects | Counters, rate limiting, RPC with SQLite storage, alarms, WebSocket hibernation |

**Hard (21–27):** newer Workers APIs, where a model's training data is thinnest and the docs should matter most.

| Task | API |
|---|---|
| 21 workflow-order | Workflows: named steps, retries with backoff, sleeps |
| 22 workflow-approval | Workflows: `waitForEvent` with a timeout, events sent from `fetch` |
| 23 secrets-store | Secrets Store bindings (`await env.API_KEY.get()`) |
| 24 static-assets | Workers Static Assets with `run_worker_first` and the `ASSETS` binding |
| 25 ws-auto-response | WebSocket hibernation auto-response and socket attachments |
| 26 rpc-target | `RpcTarget` objects returned over a service binding |
| 27 ctx-exports | `ctx.exports` loopback entrypoints with `ctx.props` |

The Workflow tests use the Vitest plugin's workflow introspection: they disable sleeps, mock events, force timeouts and inject step failures. A task can ship extra files (the static site in 24) from `tasks/<task>/files/`.

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

Baseline tier:

| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches |
|---|---|---|---|---|---|
| Haiku | Cloudflare docs search | 20/20 | 94/94 | 12 s | 0 |
| Haiku | no docs | 20/20 | 94/94 | 13 s | – |

The smallest model solves every task with or without docs, and never searches the docs. These tasks cover well-documented, widely used APIs, so they can't tell models apart or show what documentation is worth.

One grading bug was found this way: Haiku put its `cache.put` in `ctx.waitUntil`, a correct pattern that the cache test read too early. The test now waits for the write, and `regrade` rescored the run.

Hard tier:

| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches |
|---|---|---|---|---|---|
| Haiku | Cloudflare docs search | 7/7 | 28/28 | 15 s | 4 |
| Haiku | no docs | 7/7 | 28/28 | 13 s | – |

Haiku also solves every hard task without docs. With docs it searched 4 times, once each on the two Workflow tasks, Secrets Store and `ctx.exports`, and those searches didn't change any score. So far, the newer APIs are already known well enough to write from a clear spec. Two of the no-docs attempts first failed before the agent started, because Claude Code reported "not logged in" during parallel starts. They were run again, and the runner now retries that case once.

Sonnet and Opus, all 27 tasks:

| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches |
|---|---|---|---|---|---|
| Opus | Cloudflare docs search | 27/27 | 122/122 | 21 s | 0 |
| Opus | no docs | 27/27 | 122/122 | 22 s | – |
| Sonnet | Cloudflare docs search | 27/27 | 122/122 | 11 s | 0 |
| Sonnet | no docs | 27/27 | 122/122 | 12 s | – |

Every model solves every task in both conditions. Sonnet and Opus never searched the docs; Opus took about twice as long as Sonnet. So with a clear spec and the bindings in hand, all three models already write correct Workers for every API here, newer ones included. The benchmark doesn't separate them yet, and the docs question needs harder tasks to answer.

## Status

The harness and both tiers are done, and Haiku, Sonnet and Opus have each run on all 27 tasks: 162 of 162 attempts solved. Next: tasks that are harder in shape rather than API age, such as specs with several interacting parts, a requirement the agent must resolve from the docs, or a limit only the docs state.

## License

MIT
