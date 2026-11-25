Write a Worker with a cron trigger. It keeps its state in the KV namespace bound as `STATE`.

- On each scheduled run, store the run's scheduled time (from the controller, not the clock) as an ISO 8601 string under `last-run`, and add 1 to a counter stored under `runs`.
- `GET /status` returns 200 with JSON `{"lastRun": <ISO string or null>, "runs": <number>}`. Before any run that is `{"lastRun": null, "runs": 0}`.
