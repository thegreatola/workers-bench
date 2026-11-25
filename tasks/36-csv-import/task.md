# Product import

Build a product catalogue import on the D1 database bound as `DB`. This table already exists:

```sql
CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL);
```

## Import

`POST /import` takes a CSV file as the body (`text/csv`, up to 5,000 rows), exported from spreadsheet software. The first line is the header `sku,name,price`. Fields follow RFC 4180: they may be quoted, quoted fields may contain commas, newlines and doubled quotes (`""`), and lines may end in `\r\n` or `\n`.

Each row must have:
- `sku`: 1 to 32 characters of uppercase letters, digits and hyphens, not repeated elsewhere in the file.
- `name`: 1 to 200 characters.
- `price`: a non-negative decimal amount with at most two decimal places, such as `12`, `12.5` or `0.29`. Store it as whole cents.

The import is all-or-nothing:
- If every row is valid, insert or update every product and return 200 with `{"imported": <rows>}`.
- If any row is invalid, change nothing and return 422 with `{"errors": [{"line": <n>, "error": "<reason>"}, ...]}`, listing every invalid row. `line` is the row's line number in the file, counting the header as line 1. A quoted field that spans lines counts as one line, at the line where its row starts. A repeated `sku` is an error on its later row.

## Read

`GET /products/<sku>` returns 200 with `{"sku", "name", "price_cents"}`, or 404.
