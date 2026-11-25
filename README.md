# workers-bench

How well do AI coding agents write Cloudflare Workers, and does giving them Cloudflare's documentation help?

Each task is a short spec for a Worker, with the bindings it gets in `wrangler.jsonc`. An agent writes `src/index.ts`, and hidden tests grade it inside workerd, the Workers runtime, through Cloudflare's Vitest plugin. Nothing is deployed, and grading needs no Cloudflare account.

## Tasks

33 tasks, each with hidden tests and a reference solution, in three tiers.

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

**Tricky (28–33):** ordinary APIs with a planted trap. Each task ships `naive.ts`, a plausible solution that falls into the trap, and `check-tasks` requires it to fail.

| Task | The trap |
|---|---|
| 28 rewrite-split-text | HTMLRewriter hands over text in chunks, so the word can be split across two |
| 29 d1-transfer | A transfer to a missing account loses money; concurrent transfers can overdraw |
| 30 do-scheduler | One alarm for many reminders: it must re-arm, and an early run delivers nothing |
| 31 idempotency | A burst of 30 identical retries must make exactly one payment |
| 32 jwt-verify | `alg: none`, HS256 key confusion, clock skew, `aud` arrays, base64url |
| 33 queue-retry-dlq | Per-message retry delays, a dead-letter queue, two queues in one handler |

The JWT task's keys are throwaway keys made for the test. The two concurrency traps (29, 31) were checked three times each: the naive version failed every time and the reference never did.

A task's spec states only what its tests check. `npm run check-tasks` proves each task is sound: its reference solution must pass every test, and an empty Worker must pass none.

## How a run works

```
task spec + wrangler.jsonc ──> agent (Claude Code, headless) ──> src/index.ts ──> hidden tests in workerd ──> score
                                file tools only;
                                "docs" adds Cloudflare's docs search
```

- **The agent** is Claude Code in headless mode, in a fresh temp folder holding only `TASK.md`, `wrangler.jsonc` and a stub `src/index.ts`. Its tools are Read, Write, Edit, Glob and Grep, confined to that folder. It can't run code, so a score measures writing a working Worker from the spec.
- **Conditions:**
  - `none` has no outside help.
  - `docs` adds Cloudflare's documentation MCP server (`docs.mcp.cloudflare.com`), and the run counts how often the agent searches it.
  - `run` lets the agent write its own Vitest tests and run them in workerd with one tool, `run_tests`. The run counts how often it does.
  - `fix-none` and `fix-run` start the agent from a tricky task's `naive.ts`, the buggy version, and ask it to find and fix the bugs, without and with `run_tests`.
- **No shell.** `run_tests` comes from a small MCP server in this repo (`src/test-mcp.ts`) that takes no input and runs one fixed command. The first version gave the agent Bash limited to `npm test` by a permission rule. A probe showed that isn't a hard wall: `whoami` and `npm test && echo …` both ran. So the agent gets no Bash at all.
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

Tricky tier, all three models:

| Model | Condition | Tasks solved | Tests passed | Median time | Doc searches |
|---|---|---|---|---|---|
| Opus | Cloudflare docs search | 6/6 | 28/28 | 31 s | 0 |
| Opus | no docs | 6/6 | 28/28 | 28 s | – |
| Sonnet | Cloudflare docs search | 6/6 | 28/28 | 16 s | 0 |
| Sonnet | no docs | 6/6 | 28/28 | 19 s | – |
| Haiku | Cloudflare docs search | 6/6 | 28/28 | 34 s | 1 |
| Haiku | no docs | 5/6 | 27/28 | 25 s | – |

The first miss in the benchmark: Haiku without docs stored the whole message under `sent:<id>` in task 33, where the spec asks for the address. That's a slip in reading the spec, not an API question, and one miss in 36 is too few to say the docs helped. Every model avoided every planted trap.

Fixing the tricky tier's buggy Workers, all three models:

| Model | Condition | Tasks fixed | Tests passed | Median time | Test runs |
|---|---|---|---|---|---|
| Opus | can't run code | 6/6 | 28/28 | 28 s | – |
| Opus | can run its own tests | 6/6 | 28/28 | 44 s | 7 |
| Sonnet | can't run code | 6/6 | 28/28 | 16 s | – |
| Sonnet | can run its own tests | 6/6 | 28/28 | 15 s | 0 |
| Haiku | can't run code | 6/6 | 28/28 | 22 s | – |
| Haiku | can run its own tests | 6/6 | 28/28 | 26 s | 9 |

Every model found and fixed every planted bug just by reading the code against the spec, with or without the chance to run tests. When it could, Haiku ran tests 9 times across the 6 tasks and Opus 7 times, which made Opus slower without changing a score. Sonnet never ran a test. Running code doesn't separate these models on these tasks either.

## Status

Three tiers, 33 tasks and five conditions are done. Haiku, Sonnet and Opus have run every task, and fixed every buggy Worker with and without running tests: 233 of 234 attempts solved. A single-file Worker with a clear spec, or a buggy one next to its spec, is within reach of all three models, traps included. To find where they break, the next tasks should be bigger and less specified: several files and services, a vague requirement, or a limit only the docs state.

## License

MIT
