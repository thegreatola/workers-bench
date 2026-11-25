Write a Worker that verifies JSON Web Tokens with Web Crypto, with no libraries.

`GET /me` with `Authorization: Bearer <token>` returns 200 with `{"sub": "<the token's sub claim>"}` when the token is valid, and 401 with `{"error": "invalid token"}` otherwise. A token is valid only when all of these hold:

- It is a compact JWS with three base64url parts.
- The header's `kid` names a key in the JSON Web Key Set in the environment variable `JWKS` (a JSON string), and the header's `alg` is that key's `alg`. Only `RS256` and `ES256` are accepted. Anything else, `none` included, is rejected.
- The signature verifies with that key.
- `iss` equals the environment variable `ISSUER`.
- `aud` equals the environment variable `AUDIENCE`, or is an array that contains it.
- `exp` is present, and the token isn't expired, allowing 60 seconds of clock skew.
- If `nbf` is present, the token is already valid, again allowing 60 seconds of clock skew.
