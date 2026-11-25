Write a WebSocket lobby on a Durable Object that can sleep between messages. Export a Durable Object class `Lobby`, bound as `LOBBY`. There is a single lobby: always use the object named `main`.

- `GET /lobby?name=<name>` with `Upgrade: websocket` connects and returns 101. A missing or empty `name` returns 400. Without the upgrade header, return 426.
- Use the WebSocket Hibernation API (`ctx.acceptWebSocket`).
- Keep each socket's name with the socket itself (`serializeAttachment`), so it survives the object hibernating.
- Clients send the text `ping` to keep alive. The answer `pong` must come from an automatic response (`setWebSocketAutoResponse`), so pings never wake the object.
- Any other text message is sent to every other socket as `{"from":"<sender's name>","text":"<the text>"}`, and not back to the sender.
