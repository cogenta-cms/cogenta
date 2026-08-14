---
'@cogenta/import': minor
'@cogenta/cli': minor
'@cogenta/core': minor
---

New package `@cogenta/import`: `cogenta import wordpress <file.xml>` (L9 task
6). Imports a WordPress "Export All Content" WXR file — posts, pages,
categories, tags, media (downloaded and re-stored through `MediaStore`/
`StorageDriver`), authors (as real, credential-less users), approved comments,
postmeta (carried as opaque `f.json()` `customFields`, contract A has no
free-form field kind), Gutenberg blocks converted to the block vocabulary
(`prose`/`mediaFigure`/`quote`/`gallery`/`embed`) where a mapping exists, and
301 redirects from each entry's old permalink (`reason: 'import'`, the
`@cogenta/schema` redirect store's own case for this). Every WXR reader is a
zero-dependency, WXR-scoped XML tokenizer (`deps-auditor` rejected
`fast-xml-parser`: a single-maintainer seven-package split published the same
day, and a general parser's DTD support is an unnecessary XXE surface for a
file of unknown provenance) — a document declaring `<!DOCTYPE ... ENTITY` is
rejected outright.

Nothing that cannot be converted is silently dropped: an unmappable Gutenberg
block, a dead media URL, an author with no email, a trashed post — every one
of them lands in the returned `ConversionReport` (`imported`/`skipped`/
`unconvertedBlocks`/`warnings`), which `cogenta import wordpress` prints. The
command exits `0` even with items reported as unconverted — a reported
partial import is the intended outcome for a real-world export, not a
failure — and only exits non-zero when the file cannot be read or parsed at
all.

Two new `@cogenta/core` error codes: `IMPORT_WXR_PARSE_FAILED`,
`IMPORT_WXR_UNSAFE_DOCUMENT`.
