Write a file store on the R2 bucket bound as `BUCKET`. The object key is everything after `/files/`, slashes included, so `/files/a/b/c.txt` uses the key `a/b/c.txt`.

- `PUT /files/:key` stores the request body and keeps the request's `Content-Type`. It returns 201 with JSON `{"key": <key>, "size": <bytes>, "etag": <the object's etag>}`.
- `GET /files/:key` returns 200 with the body, the stored `Content-Type`, and an `ETag` header holding the object's HTTP etag (quoted). If the request's `If-None-Match` matches that ETag, return 304 with no body. A missing object returns 404.
- `DELETE /files/:key` deletes it and returns 204.
