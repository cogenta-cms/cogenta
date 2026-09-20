---
'@cogenta/api': minor
'@cogenta/cli': minor
---

Stop a non-image upload from carrying a content type a browser would execute.

An image's stored type has been the one its bytes earn, never the one the
uploader declared, since L10's security review. Every other kind was stored
exactly as declared, so a `kind: 'file'` upload could carry `text/html` — and
the bytes came back from the site's own origin with that type.

Not exploitable as it stood: reaching those bytes needs a bearer token, a
browser navigation gets 401, and `/_image` refuses a non-image outright. What
was missing is the layer under that, and a token is a thin thing to rest on.
The admin also announced a list of accepted types the API never enforced.

Two layers now, neither of which refuses a legitimate file:

- **On upload**, a declared type that executes on an origin — `text/html`,
  `image/svg+xml`, the XML and JavaScript types — is stored as
  `application/octet-stream`. The file is kept; only serving it as code is
  refused. A `.txt`, a `.pdf`, a `.csv` or a `.docx` is stored exactly as
  declared, as before.
- **On serving**, `/api/media/{id}/file` sends `Content-Disposition:
  attachment` for every kind but `image`, so whatever a file turns out to be
  the browser downloads it rather than rendering it. Images stay inline — the
  admin's own grid displays them.

Verified against a running site: an HTML upload stored as
`application/octet-stream` and served as an attachment, an image still served
inline with its own type.
