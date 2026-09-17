---
'@cogenta/core': minor
'@cogenta/render': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Crop and rotate an image in the media library, without losing its original

`@cogenta/render`'s `TransformOperation` gains `rotate` (quarter turns, applied before the
crop), on both the native and the WebAssembly image drivers. `@cogenta/api` adds
`POST /api/media/{id}/edit` and `POST /api/media/{id}/restore`: the first edit keeps a copy
of the untouched original, every edit starts from it again, and restoring puts it back; the
focal point follows. A single-asset read says whether the image is `edited`, and
`GET /api/media/{id}/file?original=1` serves the original. `MediaImageProcessor` gains an
optional `edit`, implemented by `cogenta serve`; without it the route answers the new
`MEDIA_EDIT_UNAVAILABLE` (501).

Fixed on the way: replacing an image twice with the same file deleted it (the second write
landed on the key it then removed as "the old one"), and replacing it with one of the same
size deleted the variants it had just written.
