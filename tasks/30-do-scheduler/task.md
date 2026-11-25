Write a reminder scheduler on a Durable Object that uses its one alarm for many reminders. Export a Durable Object class `Scheduler`, bound as `SCHEDULER`, with one object per name.

- `POST /schedule/:name` takes `{"message": "<non-empty string>", "delaySeconds": <whole number, 0 to 86400>}`. It adds a pending reminder due `delaySeconds` from now and returns 201 with `{"id": "<a new unique id>", "dueAt": <ms since epoch>}`. Invalid input returns 400.
- The object's alarm must always be set to the earliest pending `dueAt`, or not set at all when nothing is pending.
- When the alarm runs, deliver every pending reminder whose `dueAt` has passed, in `dueAt` order (reminders with equal `dueAt` in the order they were scheduled). Then set the alarm for the next pending reminder. An alarm can run before anything is due, for example on a retry. Then it delivers nothing, and the alarm stays set for the earliest pending reminder.
- `GET /schedule/:name` returns 200 with `{"pending": [{"id", "message", "dueAt"}, ...] sorted by dueAt, "delivered": ["<message>", ...] in delivery order}`.

Keep everything in durable storage.
