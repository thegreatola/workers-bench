Write WebSocket chat rooms with a Durable Object using the WebSocket Hibernation API (`ctx.acceptWebSocket`). Export a Durable Object class `ChatRoom`, bound as `ROOMS`, with one object per room name.

- `GET /rooms/:name` with `Upgrade: websocket` connects to that room and returns 101. Without the upgrade header it returns 426.
- Right after a socket connects, the server sends it `{"type":"welcome","count":<sockets connected to the room, this one included>}`.
- When a socket sends a text message, the server sends `{"type":"message","text":"<the text>"}` to every other socket in the room, but not back to the sender.
- When a socket closes, it no longer receives messages or counts toward `count`.
