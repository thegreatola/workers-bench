interface Env { DLQ: Queue; SENT: KVNamespace; DEAD: KVNamespace }
export default {
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const m of batch.messages) {
      const { to, subject } = m.body;
      if (!to.includes("@")) { await env.DLQ.send({ to, subject, error: "invalid address" }); m.ack(); continue; }
      if (to.endsWith("@bounce.test")) { if (m.attempts < 3) m.retry(); else { await env.DLQ.send({ to, subject, error: "bounced" }); m.ack(); } continue; }
      await env.SENT.put(`sent:${m.id}`, to);
      m.ack();
    }
  },
};
