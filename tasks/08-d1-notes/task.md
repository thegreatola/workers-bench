Write a notes API on the D1 database bound as `DB`. The table already exists:

```sql
CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL);
```

Every response body is JSON.

- `POST /notes` takes `{"text": "..."}` and returns 201 with the new note, `{"id": <n>, "text": "..."}`. Text that is missing, not a string, or empty after trimming returns 400 with `{"error": "..."}`. Store the text exactly as sent.
- `GET /notes` returns 200 with `{"notes": [{"id", "text"}, ...]}`, ordered by id ascending. `?limit=<n>` caps the count, 1 to 100, default 20. A limit outside that range returns 400.
- `GET /notes/:id` returns 200 with the note, or 404.
- `DELETE /notes/:id` returns 204, or 404 when there is no such note.
