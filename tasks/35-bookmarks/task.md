# Bookmarks

Build a bookmarks API on the KV namespace bound as `BOOKMARKS`. A bookmark is identified by its URL. Users save long URLs (tracking parameters and all) and tag them heavily.

A bookmark is `{"url": "...", "title": "...", "tags": ["...", ...]}`:
- `url`: an absolute `http` or `https` URL of at most 4,000 characters.
- `title`: a string of at most 200 characters.
- `tags`: at most 100 tags, each 1 to 40 characters of lowercase letters, digits and hyphens. Store them with duplicates removed and sorted.

## API

All responses are JSON, except 204s.

- `PUT /bookmarks` with a bookmark creates it, or replaces the one with that URL. Returns 200 with the stored bookmark, or 400 for invalid input.
- `GET /bookmarks?url=<url>` returns 200 with the bookmark, or 404.
- `DELETE /bookmarks?url=<url>` returns 204, or 404 when there's no such bookmark.
- `GET /bookmarks?tag=<tag>` returns 200 with `{"bookmarks": [...]}`: every bookmark that has that tag right now, sorted by URL.
