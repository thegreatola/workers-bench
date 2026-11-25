Write expense approval as a Cloudflare Workflow that waits for a person. Export a class `ExpenseWorkflow` that extends `WorkflowEntrypoint` from `cloudflare:workers`. It is bound as `EXPENSES`, and its params are `{"expenseId": string, "amount": number}`.

The workflow runs these steps, using exactly these step names:

1. `record`: returns `{"recorded": true}`.
2. `approval`: waits for an event of type `decision` for up to 1 day. Its payload is `{"approved": boolean, "by": string}`.
3. When approved, `pay`: returns `{"paid": <amount>}`. The output is `{"status": "paid", "by": "<by>"}`.
   When rejected, the output is `{"status": "rejected", "by": "<by>"}`, and `pay` doesn't run.
   When no decision arrives in time, the output is `{"status": "expired"}`. The workflow still completes rather than failing.

The Worker's `fetch`:

- `POST /expenses` takes `{"expenseId": "<non-empty string>", "amount": <number above 0>}` and starts an instance whose id is the `expenseId`. Returns 202 with `{"id": "<expenseId>"}`, or 400 for invalid input.
- `POST /expenses/:id/decision` takes `{"approved": <boolean>, "by": "<non-empty string>"}`, sends it to that instance as the `decision` event, and returns 202. Invalid input returns 400.
