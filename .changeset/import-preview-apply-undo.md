---
'@cogenta/core': minor
'@cogenta/import': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Import gains a real preview/apply/undo flow (fiche 25), on top of the existing
one-shot WordPress uploader, which is unchanged and still works.

`@cogenta/import`:
- `analyzeWordPress(xml)` previews a WXR export — counts, proposed collection mapping,
  authors, media URLs and volume, slug conflicts and everything that will be skipped —
  without writing anything.
- `importWordPress` accepts `{ tracking, runId }`: passed, every post/page/comment it
  writes is recorded, a second call with the same `runId` resumes without duplicating,
  and `undoImport` can trash everything the run created (never `purge`, so an
  over-eager undo is itself reversible from the trash).
- New sources: `parseCsv`/`csvToRecords` (zero dependency, RFC 4180), `feedToRecords`
  (RSS 2.0 and Atom), `parseJsonImport`/`analyzeJson`/`applyJson` (a minimal Cogenta
  JSON import format). CSV and RSS/Atom share a generic mapping/apply engine
  (`analyzeGeneric`/`applyGeneric`, `proposeFieldMapping`/`resolveMapping`) against any
  collection the target site declares — real field correspondence, not a fixed shape.
- `createImportTrackingStore` — two new tables (`cogenta_import_runs`/
  `cogenta_import_items`), owned entirely by this package, never a field on contract A.
- Outbound media downloads are now guarded against SSRF (private/loopback/link-local
  addresses refused, including on a DNS-rebound host name), capped in size and count,
  and time out.

`@cogenta/core`: new error codes (`IMPORT_RUN_NOT_FOUND`, `IMPORT_SOURCE_INVALID`,
`IMPORT_ALREADY_APPLIED`, `IMPORT_MAPPING_INVALID`, `IMPORT_MEDIA_URL_UNSAFE`,
`IMPORT_CSV_INVALID`, `IMPORT_FEED_INVALID`).

`@cogenta/api`: `createImportRouter` gains `POST /api/import/analyze`,
`GET /api/import/runs`, `GET /api/import/runs/{id}`, `POST /api/import/runs/{id}/apply`
and `POST /api/import/runs/{id}/cancel`, behind five new optional `ImportRouterOptions`
callbacks (`analyze`/`apply`/`getRun`/`listRuns`/`cancel`). All admin-only. The legacy
`POST /api/import/wordpress` route is untouched.

`@cogenta/cli`: `cogenta serve` wires the full flow — WordPress, CSV, JSON and RSS/Atom
— through the site's own stores, storage driver and read-only guard.
