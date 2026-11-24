Write a Worker that serves one JSON endpoint with CORS. The allowed origins are in the environment variable `ALLOWED_ORIGINS`, separated by commas.

- `GET /data` returns 200 with `{"data":42}`. When the request's `Origin` is allowed, add `Access-Control-Allow-Origin` set to that origin and `Vary: Origin`. When it isn't allowed, or there is no `Origin`, send no `Access-Control-Allow-Origin` header.
- `OPTIONS` to any path is a preflight:
  - Allowed origin: status 204 with `Access-Control-Allow-Origin` (the origin), `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Max-Age: 86400`, and `Vary: Origin`. If the request has `Access-Control-Request-Headers`, echo its value back in `Access-Control-Allow-Headers`.
  - Origin not allowed: status 403 with no `Access-Control-Allow-Origin`.
- Anything else returns 404.
