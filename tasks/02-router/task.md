Write a Worker with a small JSON API. Every response, errors included, has `Content-Type: application/json`.

- `GET /users/:id` returns 200 with `{"id":"<id>"}` when `id` is made only of digits. Any other `id` returns 400 with `{"error":"invalid id"}`.
- `POST /echo` parses the request body as JSON and returns it unchanged with status 200. A body that isn't valid JSON returns 400 with `{"error":"invalid json"}`.
- Every other method and path returns 404 with `{"error":"not found"}`. That includes `/users/` and `/users/12/extra`.
