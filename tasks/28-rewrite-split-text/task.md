Write a Worker that highlights a word in streamed HTML with `HTMLRewriter`.

`POST /highlight` takes an HTML document as the request body, which can be large and arrive in many small pieces. Return it with `Content-Type: text/html`, streaming it through `HTMLRewriter`. Every occurrence of the exact text `Workers` inside a `<p>` element becomes `<mark>Workers</mark>`. Everything else, including text outside `<p>` and attribute values, stays exactly as it was.
