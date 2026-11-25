Write a rate-limited API using a Durable Object. Export a Durable Object class called `RateLimiter`, bound as `LIMITER`, with one object per client. The client is the `CF-Connecting-IP` request header, or `anonymous` when it's missing.

Each client may make 5 requests per fixed 60-second window. The window starts at the client's first request and resets 60 seconds later.

- `GET /api` within the limit returns 200 with JSON `{"remaining": <requests left in this window>}` and the header `X-RateLimit-Remaining` set to the same number. The first request returns 4, the fifth returns 0.
- Over the limit, it returns 429 with JSON `{"error": "rate limited"}` and a `Retry-After` header: the whole number of seconds until the window resets, at least 1.
