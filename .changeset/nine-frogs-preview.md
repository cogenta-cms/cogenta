---
'@cogenta/api': minor
'@cogenta/cli': patch
---

Add preview links: `POST /{collection}/{id}/preview` mints a one-hour,
one-entry `PreviewGrant` token and returns the entry's real page path/URL
alongside it (`site.url` + the collection's routing pattern). Any read of
that one entry — `GET /{collection}/{id}` or `GET /-/by-path` — now accepts
`?preview=<token>` together with `?state=working` to unlock exactly that
entry's draft for whoever holds the link, and nothing else; a token for one
entry never covers another, and a request with no token behaves exactly as
it did before this change.

The token is verified lazily, only when a `preview` query parameter is
actually present, so an ordinary request never needs
`COGENTA_PREVIEW_SIGNING_KEY` to be set at all — only minting and consuming
a preview link do.

`cogenta serve` passes `site.url` through to the REST router so a minted
link is a ready-to-open absolute URL, not just a token the caller has to
build a path for by hand.
