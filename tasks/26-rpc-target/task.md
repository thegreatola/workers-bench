Write a bank service called over Workers RPC. Export a class `Bank` that extends `WorkerEntrypoint` from `cloudflare:workers`. `wrangler.jsonc` binds it back to this same Worker as the service binding `BANK`, so other code calls `env.BANK.open(...)`.

- `Bank.open(owner: string)` returns an account object that the caller keeps calling methods on, over RPC. Make it a class that extends `RpcTarget`. Its methods:
  - `deposit(amount: number): number` adds the amount and returns the new balance. An amount that isn't a positive number throws an `Error` whose message contains `invalid amount`.
  - `withdraw(amount: number): number` subtracts the amount and returns the new balance. Taking out more than the balance throws an `Error` whose message contains `insufficient funds`, and the balance stays the same.
  - `balance(): number` returns the balance.
  - `owner(): string` returns the owner.
- Each `open` call starts a new account at a balance of 0. Accounts only need to live as long as the caller holds them.

The Worker's default `fetch` can return 404 for everything.
