Write an API that checks callers against a key kept in Cloudflare Secrets Store. The key is the Secrets Store secret bound as `API_KEY` in `wrangler.jsonc`.

- `GET /private` with `Authorization: Bearer <the key>` returns 200 with `{"ok": true}`.
- A missing or wrong key returns 401 with `{"error": "unauthorized"}`.
- Anything else returns 404.
