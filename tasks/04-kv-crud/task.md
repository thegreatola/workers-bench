Write a Worker that stores text in the KV namespace bound as `STORE`. Keys come from the URL path and are URL-decoded, so `/kv/hello%20world` uses the key `hello world`.

- `PUT /kv/:key` stores the request body as the value and returns 201. An optional `?ttl=<seconds>` sets how long the key lives. A `ttl` below 60 or not a whole number returns 400 and stores nothing.
- `GET /kv/:key` returns 200 with the value as text, or 404 when the key doesn't exist.
- `DELETE /kv/:key` deletes the key and returns 204.
- Anything else returns 404.
