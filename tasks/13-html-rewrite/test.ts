import { exports } from "cloudflare:workers";
import { it, expect } from "vitest";
const rewrite = (html: string) => exports.default.fetch(new Request("http://w.test/rewrite", { method: "POST", body: html, headers: { "content-type": "text/html" } }));

const PAGE = `<!doctype html><html><head><title>T</title><script>alert(1)</script></head><body>
<p class="keep">Hello <b>there</b></p>
<a href="http://a.example/x?y=1">a</a>
<a href="https://b.example/">b</a>
<a href="/relative">c</a>
<a href="mailto:me@example.com">d</a>
<a href="http://c.example/" target="_blank" rel="opener">e</a>
<a href="https://d.example/" target="_self">f</a>
<script src="/tracker.js"></script>
</body></html>`;

it("returns HTML", async () => {
  const r = await rewrite(PAGE);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/^text\/html/);
});
it("upgrades http links only", async () => {
  const out = await (await rewrite(PAGE)).text();
  expect(out).toContain('href="https://a.example/x?y=1"');
  expect(out).toContain('href="https://b.example/"');
  expect(out).toContain('href="/relative"');
  expect(out).toContain('href="mailto:me@example.com"');
  expect(out).not.toContain('href="http://');
});
it("hardens target=_blank", async () => {
  const out = await (await rewrite(PAGE)).text();
  expect(out).toMatch(/<a href="https:\/\/c\.example\/" target="_blank" rel="noopener noreferrer">e<\/a>/);
  expect(out).not.toContain('rel="opener"');
  expect(out).toMatch(/<a href="https:\/\/d\.example\/" target="_self">f<\/a>/);
});
it("removes scripts and keeps the rest", async () => {
  const out = await (await rewrite(PAGE)).text();
  expect(out).not.toMatch(/<script/i);
  expect(out).not.toContain("alert(1)");
  expect(out).toContain('<p class="keep">Hello <b>there</b></p>');
  expect(out).toContain("<title>T</title>");
});
