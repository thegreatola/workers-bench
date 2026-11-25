Write a payments endpoint that is safe to retry, using the D1 database bound as `DB`. This table already exists:

```sql
CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER NOT NULL, currency TEXT NOT NULL);
```

You may create any other tables you need, with `CREATE TABLE IF NOT EXISTS`.

`POST /payments` needs an `Idempotency-Key` header and a JSON body `{"amount": <whole number above 0>, "currency": "USD" or "EUR"}`.

- The first request with a key creates exactly one row in `payments` and returns 201 with `{"id": <row id>, "amount", "currency"}`.
- A later request with the same key and the same body creates nothing and returns the same status and body as the first.
- The same key with a different body returns 422 with `{"error": "idempotency key reused"}`.
- No key, or an invalid body: 400. A rejected request creates nothing.

Clients retry aggressively, so many identical requests with one key can arrive at the same moment. Exactly one payment may come of them, and every one of them gets the same 201 response.
