---
'@cogenta/api': minor
'@cogenta/cli': minor
---

Add `/api/media` — upload, list, read, edit and delete media assets — over
the `MediaStore` `@cogenta/core` shipped previously. `cogenta serve` now
selects a storage driver (S3 or local, same registry the rest of the config
already uses) and mounts the route alongside `/api/content` and `/api/auth`.

Uploads travel as JSON with the file base64-encoded rather than multipart:
the REST transport's own contract is "a body already parsed by the
transport", and staying inside it avoids a multipart-parsing dependency for
an admin-only upload path. The real file type is read from the bytes, never
from the declared `Content-Type` or filename — the same check the image
pipeline already used, moved into `@cogenta/core` in the previous release
so this route can share it. An image whose bytes are not one of AVIF/WebP/
JPEG/PNG is refused, naming what it actually is; an SVG upload is refused
outright, per ADR-0017.

Every route requires an authenticated actor — there is no per-collection
permission model for media the way there is for content yet, so today's
gate is "signed in at all," tightened once L4's agent tool permissions
(contract C's `media.read`/`media.write`) land.
