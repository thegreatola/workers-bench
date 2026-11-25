Write named counters backed by a Durable Object. Export a Durable Object class called `Counter`, bound as `COUNTER`. Each name gets its own object, and the count is kept in its durable storage.

All responses are JSON:

- `POST /counter/:name/increment` adds 1, or `?by=<whole number>` (which may be negative). Returns `{"name": "<name>", "value": <new value>}`. A `by` that isn't a whole number returns 400.
- `GET /counter/:name` returns `{"name": "<name>", "value": <value>}`, with 0 for a new counter.
- `POST /counter/:name/reset` sets it to 0 and returns `{"name": "<name>", "value": 0}`.

Many increments can arrive at once, and none may be lost.
