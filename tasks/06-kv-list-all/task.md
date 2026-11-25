Write a Worker that lists keys in the KV namespace bound as `STORE`.

`GET /keys?prefix=<prefix>` returns 200 with JSON `{"count": <n>, "keys": [<key names>]}` holding every key that starts with the prefix, sorted. A missing `prefix` means all keys. The namespace can hold thousands of keys, and all of them must be returned.
