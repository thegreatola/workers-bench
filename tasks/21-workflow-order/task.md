Write an order pipeline as a Cloudflare Workflow. Export a class `OrderWorkflow` that extends `WorkflowEntrypoint` from `cloudflare:workers`. It is bound as `ORDERS`, and its params are `{"orderId": string, "amount": number}`.

The workflow runs these steps, using exactly these step names:

1. `charge`: returns `{"charged": <amount>}`. Charging can fail now and then, so give this step retries: up to 3, starting 1 second apart, with exponential backoff.
2. `cool-off`: a sleep of 1 hour.
3. `ship`: returns `{"shipped": true}`.

The workflow's output is `{"orderId": <orderId>, "charged": <amount>, "shipped": true}`.

The Worker's `fetch`:

- `POST /orders` takes `{"orderId": "<non-empty string>", "amount": <number above 0>}`. It starts an instance whose id is the `orderId` and returns 202 with `{"id": "<orderId>"}`. Invalid input returns 400.
- `GET /orders/:id` returns 200 with `{"id": "<id>", "status": "<the instance's status>"}`, or 404 when there is no such instance.
