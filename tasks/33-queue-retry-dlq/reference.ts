interface Env { DLQ: Queue; SENT: KVNamespace; DEAD: KVNamespace }
interface Email { to: string; subject: string; error?: string }
export default {
  async queue(batch: MessageBatch<Email>, env: Env): Promise<void> {
    if (batch.queue === "emails-dlq") {
      for (const m of batch.messages) { await env.DEAD.put(`dead:${m.body.to}`, JSON.stringify(m.body)); m.ack(); }
      return;
    }
    for (const m of batch.messages) {
      const { to, subject } = m.body;
      if (!to.includes("@")) { await env.DLQ.send({ to, subject, error: "invalid address" }); m.ack(); continue; }
      if (to.endsWith("@bounce.test")) {
        if (m.attempts < 3) m.retry({ delaySeconds: 30 * 2 ** (m.attempts - 1) });
        else { await env.DLQ.send({ to, subject, error: "bounced" }); m.ack(); }
        continue;
      }
      await env.SENT.put(`sent:${m.id}`, to);
      m.ack();
    }
  },
  async fetch(): Promise<Response> { return new Response("not found", { status: 404 }); },
};
