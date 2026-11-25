Write the Worker in front of a single-page app that uses Workers Static Assets. The site's files are in `public/`, and `wrangler.jsonc` binds them as `ASSETS`, runs the Worker first for every request, and serves `index.html` for unknown paths.

- `GET /api/health` returns 200 with `{"ok": true}`.
- Any other path under `/api/` returns 404 with `{"error": "not found"}`. It never falls through to the app.
- Every other request is served from the static assets. Add these headers to each of those responses:
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: default-src 'self'`

Unknown app routes like `/settings/profile` get `index.html`, just as the assets config already arranges.
