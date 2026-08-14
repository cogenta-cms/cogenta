---
'@cogenta/core': minor
'@cogenta/render': patch
---

Add `MediaStore` to `@cogenta/core` — the persisted metadata record for a media
asset (alt text, decorative flag with a required justification, focal point,
dimensions, storage key), backed by one SQL table played against SQLite,
Postgres and MySQL through the same contract, the same shape as the degraded
job queue. Nothing wired this to a route yet: L2 task 11 (médiathèque) is
still in progress, and this is its data layer.

Alt text policy is enforced in the store, not left to a caller to remember:
a non-decorative asset needs non-empty alt text, and a decorative one needs a
justification, writing `alt=""` regardless of what was passed — matching
L2-admin.md's own rule that a decorative image never gets an invented
description.

`sniffImageFormat`/`describeContainer` (real-type detection by magic bytes,
never by filename or `Content-Type`) moved from `@cogenta/render` into
`@cogenta/core`, since the upcoming media upload route needs the exact same
check and depending on `@cogenta/render` for four byte-signature functions
would pull in its Astro/sharp integration for no reason. `@cogenta/render`
re-exports both from its own `images` module, so no call site there changes.

ADR-0017 records the SVG policy this data layer assumes: refused by default,
never served raw, until a reviewed sanitizer exists.
