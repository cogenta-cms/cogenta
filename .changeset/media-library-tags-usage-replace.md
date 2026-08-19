---
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/schema': minor
'@cogenta/render': minor
---

Media library (fiche 11): tags, usage tracking, in-place replace, and richer
listing.

**Breaking for a custom `MediaStore` implementation**, written as `minor`
following this project's established pre-alpha convention (0.x, no package
has ever used `major`, and one here would jump straight to `1.0.0` — which
"pre-alpha" contradicts). `@cogenta/core`'s `MediaStore` interface gains two
new required methods, `count()` (the total match count ignoring
`limit`/`cursor`, so the admin can show "2,000 assets" instead of only "there
is another page") and `replace()` (overwrite the bytes behind an existing id
in place — every entry and block already holding that id keeps working,
unchanged). `MediaAsset` gains two new required fields: `tags` (free-form
labels, not a hierarchy — an asset commonly belongs to more than one subject
at once) and `contentHash` (a short digest of the stored bytes, folded into
`/_image` URLs as `&v=` to bust the year-long immutable cache when an asset
is replaced — never a secret, never used for integrity). The only
implementation in this repo, `createDatabaseMediaStore`, is updated; a
third-party driver is not.

Backward-compatible additions: `CreateMediaInput`/`UpdateMediaInput` gain
optional `tags`; `ListMediaOptions` gains `tag`, `from`/`to` (created-at
range), `sort` (`MediaSortField`: `createdAt`/`filename`/`size`), and
`direction`. `@cogenta/render`'s `MediaAsset` gains an optional `version`
field (`theme@1.2`) — absent is fully backward compatible, exactly today's
behaviour with no `&v=` appended.

`@cogenta/api`'s `createMediaRouter` gains real multipart parsing
(`packages/api/src/rest/multipart.ts`, zero new dependency — R9/R10), a
`POST /api/media/{id}/replace` route, `tag`/`from`/`to`/`sort`/`direction`
query parameters on the list route, and EXIF GPS stripping on upload and
replace (`stripGps`, opt-out per request, default on — a photo's location is
not something an editor usually means to publish).

`@cogenta/schema` gains `findMediaUsage` (`packages/schema/src/media-usage.ts`):
scans every collection's entries for a media id in a `media`/`richText`/
`blocks` field and reports where it is referenced, so the admin can warn
before deleting an asset still in use rather than after. `titleOf` (from
`search/extract.ts`) is now exported — `findMediaUsage` needed the same
"what does an editor call this entry" logic the search indexer already had,
and duplicating it would have drifted.
