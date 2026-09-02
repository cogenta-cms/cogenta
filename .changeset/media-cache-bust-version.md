---
"@cogenta/render": minor
"@cogenta/cli": patch
---

Fixed the media cache-busting bug audit 05-mediatheque §6 T02 found: replacing an
uploaded file (`MediaStore.replace()`, fiche 11 task 4) has recorded a fresh
`contentHash` since `theme@1.2`, and `RenderMediaAsset`/`MediaAsset.version` has existed
on the type since then too — but `variantUrl()` never actually read it, and
`loadRenderMedia()` (`cogenta serve`) never actually set it. The result: a replaced
logo kept serving under the exact same `/_image?id=…` query string a year-long
`Cache-Control: immutable` response had already cached, everywhere that image was
already rendered.

`@cogenta/render`'s `variantUrl()` now folds `media.version` into every candidate URL
as `&v=` when present, unchanged (no `&v=`) when absent — fully backward compatible for
a media entity built without this field. `@cogenta/cli`'s `loadRenderMedia()` now sets
`version: asset.contentHash`, so `og:image`, JSON-LD's `image`, and every `srcset`
candidate all change URL the moment a file is replaced, which is what actually protects
a page a browser or CDN has already cached: an `immutable` response is never
revalidated, so the origin's own stored bytes changing is not what breaks the cache —
only the URL changing is.

Also documents the `version` field on contract D's `MediaReference` (`docs/04-contrats.md`
§ Contrat D), additive to `theme@1.2`.
