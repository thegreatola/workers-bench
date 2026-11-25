# workers-bench

How well do AI coding agents write Cloudflare Workers, and does giving them Cloudflare's documentation help?

Each task is a short spec for a Worker, with the bindings it gets in `wrangler.jsonc`. An agent writes `src/index.ts`, and hidden tests grade it inside workerd, the Workers runtime, through Cloudflare's Vitest plugin. Nothing is deployed, and grading needs no Cloudflare account.

## Tasks

36 tasks, each with hidden tests and a reference solution, in four tiers.

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

**Systems (34–36):** product-sized specs across several bindings, each with a platform limit that is in Cloudflare's docs but not in the spec. The local runtime enforces these limits, so breaking one fails the test.

| Task | Built on | The limit the spec doesn't mention |
|---|---|---|
| 34 link-shortener | KV, D1, a queue, an admin token | D1 takes at most 100 bound parameters, so a 100-click batch can't be one multi-row INSERT |
| 35 bookmarks | KV keyed by URL | KV keys are at most 512 bytes, and the URLs run to 4,000 characters |
| 36 csv-import | D1 | The same parameter limit at 2,000 rows, plus RFC 4180 quoting, exact cents and an all-or-nothing import |

Agents may split their code across several files in `src/`; the whole folder is saved and graded.

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

Four models: Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.2 (asked for by full id; Claude Code's short name `fable` gives Fable 5.1, so each result records the model that answered). Every model ran every task with and without docs, and every buggy Worker with and without `run_tests`.

| Model | Attempts solved | Write, no docs | Write, docs | Fix, no tests | Fix, can test |
|---|---|---|---|---|---|
| Fable 5.2 | 84/84 | 36/36 | 36/36 | 6/6 | 6/6 |
| Opus 5.5 | 84/84 | 36/36 | 36/36 | 6/6 | 6/6 |
| Sonnet 5.5 | 84/84 | 36/36 | 36/36 | 6/6 | 6/6 |
| Haiku 5.5 | 83/84 | 35/36 | 36/36 | 6/6 | 6/6 |

335 of 336 attempts solved. The one miss is Haiku without docs on task 33: it stored the whole message under `sent:<id>` where the spec asks for the address, a slip in reading the spec.

What the runs show:

- **A clear spec is enough.** Every model wrote correct Workers for every API here, the newest ones included. They avoided every planted trap and every hidden platform limit, and found every planted bug by reading alone.
- **Docs were barely used.** Across all runs with the docs tool, the agents searched it a handful of times, almost all Haiku, and no search changed a score.
- **Running tests didn't change scores.** Fable, Haiku and Opus ran tests when they could, but Sonnet never did. Everything was fixed either way.
- **Speed differs, quality doesn't.** Sonnet is consistently the fastest, at a median of 10 to 25 s a task. Opus and Fable usually take about twice as long.

### What went wrong in the benchmark

Seventeen "failures" across these runs were the benchmark's fault, not the models'. Each was fixed, and the affected code was regraded or the task was re-run:

- **Cache (14):** the test read the cache before a `waitUntil` write had landed.
- **Link shortener (34):** the test demanded explicit acks, but a queue handler that returns cleanly acks its batch.
- **CSV import (36):** the spec's line-number rule could be read two ways. The wording was fixed, and the task was re-run for every model.
- **Alarm (18):** the test fired the alarm minutes early. Fable's handler rightly refused to deliver before the due time.
- **R2 range (20):** RFC 9110 lets a server ignore a Range header in an unknown unit, but the test demanded 416.

Both the alarm and range bugs surfaced only when Fable 5.2 wrote more careful code than the tests expected.

`check-tasks` once flagged a task under heavy machine load and passed on every rerun. The concurrency traps (29, 31) rely on a race that a loaded machine can occasionally miss. That affects the self-check only, never an agent's score.

## Status

Four tiers, 36 tasks and five conditions, run with four models: 335 of 336 attempts solved. For a single Worker with a clear spec, even one across several bindings with hidden limits, current models no longer separate. A benchmark that ranks them needs work that is open-ended rather than specified: building from a vague brief, changing an existing multi-file codebase, or longer tasks where a misread early decision has to be noticed and undone.

## License

MIT
