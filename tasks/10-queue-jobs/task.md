Write a Worker that both produces and consumes the queue bound as `JOBS` (queue name `jobs`). Results go in the KV namespace bound as `RESULTS`.

- `POST /jobs` takes `{"id": "<non-empty string>", "n": <whole number, 0 or more>}`. When valid, send that object to the queue and return 202 with `{"queued": "<id>"}`. Otherwise return 400.
- The queue consumer handles each message on its own:
  - `n` of 0 or more: store `{"id": "<id>", "square": <n*n>}` as JSON under `job:<id>` in `RESULTS`, then acknowledge that message.
  - `n` negative: retry that message only. Don't let it hold up the others in the batch.
