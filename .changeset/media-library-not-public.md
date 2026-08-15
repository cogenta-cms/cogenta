---
'@cogenta/api': major
'@cogenta/cli': patch
---

**Breaking:** `GET /api/media` and `GET /api/media/{id}` now require an
authenticated actor, like every other route on that router. They never did,
despite the file's own doc comment claiming otherwise since L2 — so an
anonymous request returned every asset's id, filename, alt text, storage key
and uploader.

That gap became a real exfiltration path the moment L10 added a public
`/_image?id=…` delivery endpoint: the ids that endpoint is keyed on are
unguessable UUIDs, but they were *listable*, so every uploaded image —
including the ones attached to nothing published — was downloadable without a
session. Found by the security review of this lot.

Any client reading the media library must now send its bearer token. The
admin already did on every call.

Two related fixes in the same area:

- An uploaded image is stored with the content type its **bytes** earn, never
  the one the uploader declared. Sniffing already decided whether the file is
  an image; repeating the declared type afterwards let a genuine PNG announced
  as `text/html` be served as a document on the site's own origin, publicly
  and cached for a year. `/_image` also whitelists the type it puts on the
  wire, so an asset stored before this fix serves as an opaque download rather
  than executing.
- `cogenta serve` no longer marks a page rendered for a signed-in actor as
  cacheable by a shared cache. A page render is per-actor — an editor sees the
  draft at the same URL — and `public, s-maxage=…` is precisely what RFC 9111
  §3.5 says re-authorises a CDN to store the answer to a request carrying
  `Authorization`. Anything sent with credentials is now `private, no-store`.
- `/sitemap.xml` no longer 500s when the site has a routed collection the
  `public` role may not read: such a collection is skipped, since it has no
  public URLs to list.
