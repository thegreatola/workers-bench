Write money transfers between accounts on the D1 database bound as `DB`. The table already exists:

```sql
CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL);
```

`POST /transfers` takes `{"from": "<account id>", "to": "<account id>", "amount": <whole number above 0>}`.

- Success: 200 with `{"from": {"id", "balance"}, "to": {"id", "balance"}}`, showing the new balances.
- Bad input, including `from` equal to `to`: 400.
- Either account doesn't exist: 404.
- `from` has less than `amount`: 409 with `{"error": "insufficient funds"}`.

A transfer either fully happens or doesn't happen at all. A balance never goes below zero and money is never created or lost, even when many transfers run at the same time.
