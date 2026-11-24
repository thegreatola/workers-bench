Write a Worker that answers JSON health checks.

- `GET` to any path returns status 200 with the JSON body `{"status":"ok","path":"<the request's pathname>"}` and the header `Content-Type: application/json`.
- `HEAD` to any path returns status 200 with the same headers and no body.
- Any other method returns status 405 with an empty body and the header `Allow: GET, HEAD`.
