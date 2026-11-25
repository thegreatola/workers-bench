Write a Worker that streams Server-Sent Events.

`GET /events?count=<n>` (n from 1 to 50, default 3) returns 200 with `Content-Type: text/event-stream` and `Cache-Control: no-cache`. The body is streamed, not built in one string, and is exactly, for each i from 1 to n:

```
id: <i>
event: tick
data: {"i":<i>}

```

followed by one final event:

```
event: done
data: {}

```

Each line ends with `\n`, and each event ends with a blank line. A `count` outside 1 to 50, or not a whole number, returns 400.
