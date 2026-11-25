interface Env { BUCKET: R2Bucket }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/files\/(.+)$/);
    if (req.method !== "GET" || !m) return new Response("not found", { status: 404 });
    const key = decodeURIComponent(m[1]);
    const head = await env.BUCKET.head(key);
    if (!head) return new Response("not found", { status: 404 });
    const total = head.size;
    const header = req.headers.get("Range");
    if (header === null) {
      const obj = await env.BUCKET.get(key);
      return new Response(obj!.body, { headers: { "Accept-Ranges": "bytes", "Content-Length": String(total) } });
    }
    const bad = () => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const r = header.match(/^bytes=(\d*)-(\d*)$/);
    if (!r || (r[1] === "" && r[2] === "")) return bad();
    let start: number, end: number;
    if (r[1] === "") { const n = +r[2]; if (n === 0) return bad(); start = Math.max(0, total - n); end = total - 1; }
    else { start = +r[1]; end = r[2] === "" ? total - 1 : Math.min(+r[2], total - 1); if (r[2] !== "" && +r[2] < start) return bad(); }
    if (start >= total) return bad();
    const obj = await env.BUCKET.get(key, { range: { offset: start, length: end - start + 1 } });
    return new Response(obj!.body, { status: 206, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) } });
  },
};
