Write an email-sending queue consumer with retries and a dead-letter queue. One Worker consumes both queues in `wrangler.jsonc`, `emails` and `emails-dlq`, and can send to the dead-letter queue through the producer binding `DLQ`. It writes to the KV namespaces bound as `SENT` and `DEAD`.

A message on `emails` has the body `{"to": "<address>", "subject": "<text>"}`. Handle each message on its own:

- `to` has no `@`: a permanent failure. Send `{"to", "subject", "error": "invalid address"}` to the dead-letter queue and acknowledge the message.
- `to` ends with `@bounce.test`: a temporary failure. If the message has been attempted fewer than 3 times (its `attempts` count, which starts at 1), retry it with a delay of `30 * 2^(attempts - 1)` seconds (30, then 60). On the 3rd attempt, send `{"to", "subject", "error": "bounced"}` to the dead-letter queue and acknowledge it instead.
- Anything else is sent: write the address to `SENT` under the key `sent:<message id>` and acknowledge it.

Messages on `emails-dlq` are stored in `DEAD` as JSON under `dead:<to>`, then acknowledged.
