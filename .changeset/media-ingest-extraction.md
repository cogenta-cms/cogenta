---
'@cogenta/api': minor
---

L25 task A0b — `createMediaRouter`'s upload handler now delegates the actual
ingestion (real-type verification, GPS scrub, storage write, variant generation,
asset-row creation with cleanup on failure) to a new exported function,
`ingestMediaUpload(deps, input)` (new module `media-ingest.ts`). Behaviour is
byte-for-byte unchanged — the router's own existing test suite passes unedited —
this is purely an extraction so a caller outside the REST layer (`create-cogenta`'s
`seedDemoMedia`) can run a file through the exact same pipeline a real upload
takes, rather than a second, drifting implementation of it.

`ImageSize`, `MediaImageProcessor`, `UploadedImageVariant` and `variantKeyFor` now
live in `media-ingest.ts` and are re-exported from `media-router.ts` under the same
names — no consumer of `@cogenta/api`'s public exports needs to change anything.
