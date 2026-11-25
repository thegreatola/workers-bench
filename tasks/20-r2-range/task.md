Write a Worker that serves files from the R2 bucket bound as `BUCKET` at `GET /files/:key`, with support for HTTP range requests (RFC 9110). The key is everything after `/files/`.

- No `Range` header: 200 with the whole object and `Accept-Ranges: bytes`.
- A satisfiable single range, written as `bytes=<start>-<end>`, `bytes=<start>-`, or `bytes=-<suffix length>`: 206 with just those bytes, `Content-Range: bytes <first>-<last>/<total>`, and the matching `Content-Length`. An end past the last byte is clamped to it.
- A range that can't be satisfied (start at or past the end, or a malformed value): 416 with `Content-Range: bytes */<total>`.
- A missing object: 404.
