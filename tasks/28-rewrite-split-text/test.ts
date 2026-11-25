import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";

/** Sends the body as a stream of tiny pieces, the way a slow upload arrives. */
function trickle(html: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(html);
  let i = 0;
  return new ReadableStream({ pull(c) { if (i >= bytes.length) return c.close(); c.enqueue(bytes.slice(i, i + size)); i += size; } });
}
const send = (html: string, size: number) => exports.default.fetch(new Request("http://w.test/highlight", { method: "POST", body: trickle(html, size), duplex: "half" } as RequestInit));

it("highlights a small document exactly", async () => {
  const html = `<h1>Workers</h1><p>Cloudflare Workers run Workers code.</p><p title="Workers">no match here</p>`;
  const r = await send(html, 1024);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/^text\/html/);
  expect(await r.text()).toBe(`<h1>Workers</h1><p>Cloudflare <mark>Workers</mark> run <mark>Workers</mark> code.</p><p title="Workers">no match here</p>`);
});
it("finds the word when the body arrives in pieces that split it", async () => {
  const para = "<p>" + Array.from({ length: 60 }, (_, i) => `line ${i} about Workers and more`).join(" ") + "</p>";
  const html = `<html><body>${para}<div>Workers outside</div>${para}</body></html>`;
  for (const size of [3, 5, 7]) {
    const out = await (await send(html, size)).text();
    expect(out.match(/<mark>Workers<\/mark>/g)?.length, `piece size ${size}`).toBe(120);
    expect(out).toContain("<div>Workers outside</div>");
    expect(out.replace(/<mark>Workers<\/mark>/g, "Workers")).toBe(html);
  }
});
