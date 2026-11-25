Write one-shot reminders with Durable Object alarms. Export a Durable Object class `Reminder`, bound as `REMINDERS`, with one object per name.

- `POST /reminders/:name` takes `{"message": "<non-empty string>", "delaySeconds": <whole number, 1 to 86400>}`. It stores the message as pending and sets the object's alarm to fire `delaySeconds` from now. A new reminder replaces any pending one under that name. Returns 201 with `{"scheduledFor": <alarm time in ms since epoch>}`. Invalid input returns 400.
- When the alarm fires, the pending message moves to the delivered list.
- `GET /reminders/:name` returns 200 with `{"pending": <message or null>, "delivered": [<messages, oldest first>]}`.

State must be in durable storage, and the delay must use the alarm API, not `setTimeout`.
