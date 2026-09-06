---
'@cogenta/api': minor
---

Widen `POST /api/theme/generate` (theme-router.ts) for the Theme Creator (L26 task 5): the request body may now carry optional `attachments` (`{filename, mimeType, contentBase64}`, decoded to bytes here, the same place `assistant-router.ts` decodes its own uploads) and `baseline` (`{themeName}`, the server resolves the actual tokens itself), and each returned candidate may carry `themeName`/`chromeInput`, plus a top-level `warnings` array. Purely additive — a `{description}`-only body behaves byte-for-byte as before. `SkinGeneratorLike.generate`'s input/output widened to match.
