Write a Worker that caches an expensive lookup with the Cache API (`caches.default`).

`GET /price/:sku` returns 200 with JSON `{"sku": "<sku>", "price": <the sku's length times 100>}`. Working out the price counts as expensive: every time you compute it rather than serve it from cache, add 1 to the count stored under `calls` in the KV namespace bound as `CALLS`.

- Cache each response for 60 seconds (`Cache-Control: max-age=60`), keyed by the request URL.
- Every response carries `X-Cache: MISS` when computed, or `X-Cache: HIT` when served from the cache.
