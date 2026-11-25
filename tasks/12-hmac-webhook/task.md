Write a Worker that receives signed webhooks at `POST /webhook`. The shared secret is the environment variable `WEBHOOK_SECRET`.

The `X-Signature` header is `sha256=` followed by the lowercase hex HMAC-SHA256 of the raw request body, keyed with the secret.

- Signature valid and body is JSON: return 200 with `{"received": true, "event": <the body's "event" field>}`.
- Signature missing or wrong: return 401 with `{"error": "invalid signature"}`. Check the signature before parsing the body.
- Signature valid but body not JSON: return 400.
- Compare signatures in constant time.
