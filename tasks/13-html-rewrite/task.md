Write a Worker that cleans up HTML with `HTMLRewriter`.

`POST /rewrite` takes an HTML document as the body and returns it with `Content-Type: text/html` and these changes:

- Every `<a>` whose `href` starts with `http://` gets `https://` in its place. Other links stay as they are.
- Every `<a target="_blank">` gets `rel="noopener noreferrer"`, replacing any `rel` it had.
- Every `<script>` element is removed together with its contents.
- Everything else is left exactly as it was.
