# Link shortener

Build a link shortener with click analytics. Bindings (see `wrangler.jsonc`): the KV namespace `LINKS`, the D1 database `DB`, the queue `clicks` (producer binding `CLICKS`, consumed by this same Worker), and the variable `ADMIN_TOKEN`. The D1 database starts empty, so create whatever tables you need with `CREATE TABLE IF NOT EXISTS`.

## API

All `/api/...` responses are JSON.

**Create a link:** `POST /api/links` with `{"url": "...", "slug": "..."}`, where `slug` is optional.
- `url` must be an absolute `http` or `https` URL of at most 2048 characters.
- A custom `slug` is 3 to 32 characters of lowercase letters, digits and hyphens. `api` is reserved and can't be used.
- Without a `slug`, generate a new unique one of 7 lowercase letters and digits.
- Returns 201 with `{"slug": "...", "url": "...", "shortUrl": "<the request's origin>/<slug>"}`. Invalid input returns 400, and a slug already in use returns 409.

**Follow a link:** `GET /<slug>` redirects with 302 to the link's URL, or returns 404 for an unknown slug. Each visit is recorded as a click: send `{"slug", "country", "at"}` to the `clicks` queue. `country` is the visitor's country from `request.cf.country` (use `XX` when it's missing), and `at` is the time in ms.

**Clicks:** the queue consumer stores clicks in D1. Batches can hold up to 100 clicks.

**Stats:** `GET /api/links/<slug>/stats` returns 200 with `{"slug": "...", "clicks": <total>, "countries": {"<country>": <clicks>, ...}}`, or 404 for an unknown slug.

**Delete:** `DELETE /api/links/<slug>` with `Authorization: Bearer <ADMIN_TOKEN>` deletes the link and returns 204. Afterwards the slug and its stats return 404. A missing or wrong token returns 401.
