Write a page-hit counter that keeps its counts in the KV namespace bound as `STATS`, under the key `count:<page>`.

- `GET /hit/:page` returns 200 with the text `ok` straight away. Incrementing the count must happen after the response, using `ctx.waitUntil`, so it never delays the visitor.
- `GET /count/:page` returns 200 with the current count as plain text, or `0` for a page never hit.
