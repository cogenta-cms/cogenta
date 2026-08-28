---
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Media library folders, and the fiche 11 search/filter/sort/pagination/tags/usage/replace
work — already written and tested, never wired into the admin screen — finally called by
it (fiche 46).

**`@cogenta/core`**: `MediaAsset` gains `folderId: string | null` (`null` means
unclassified — every asset uploaded before this fiche keeps that value forever, nothing
backfills it). `CreateMediaInput`/`UpdateMediaInput` gain an optional `folderId`.
`ListMediaOptions` gains `folderId` (exact match, `null` for unclassified) and
`folderIds` (an already-resolved set, for "include subfolders"). New: `MediaFolder`,
`MediaFolderStore`, `createDatabaseMediaFolderStore` — a materialised-path tree
(same technique as the taxonomy tree, ADR-0022, kept as a *local* copy in
`folder-path.ts` since `@cogenta/core` cannot depend on `@cogenta/schema`), one
`cogenta_media_folders` table, folder names unique among siblings. New error codes:
`MEDIA_FOLDER_NOT_FOUND`, `MEDIA_FOLDER_INVALID`, `MEDIA_FOLDER_NAME_TAKEN`,
`MEDIA_FOLDER_NOT_EMPTY`, `MEDIA_FOLDER_CYCLE`, `MEDIA_FOLDER_TOO_DEEP`.

**`@cogenta/api`**: `media-router.ts` gains `/api/media/folders` (CRUD),
`/api/media/folders/{id}/move`, `/api/media/{id}/move`, `/api/media/-/bulk-move`, and
`?folderId=`/`?includeSubfolders=` on `GET /api/media`. `MediaRouterOptions` gains an
optional `folders?: MediaFolderStore` — absent, the folder routes answer 404 (the same
graceful-absence shape `usage` already had) and `?folderId=` still works as a plain
exact match. `STATUS_BY_CODE` gains the six new codes.

**`@cogenta/agents`** (no changeset — no observable change): `media.read`/`media.write`
(contract C) keep exactly the wire output they had before this fiche. `MediaAsset`
gaining `folderId` would otherwise have grown their shared output schema too — but
contract C treats an existing tool's signature as figured with no "additive is minor"
exception (unlike contract A/D, which carry one explicitly), so `folderId` is now
stripped before that shape is built at all (`toToolAsset`). Exposing it to an agent
needs a deliberate governance call — a new `tools@1.5` entry permitting additive
tool-output growth, or a separate tool — left to the human rather than decided here.

**`@cogenta/cli`**: `cogenta serve` creates the folder store and bootstraps a default
`contents` root folder once, idempotently, on every startup; wires `folders` and (a real
gap found while wiring this fiche's own admin panel — `usage` was written and tested in
fiche 11 but never actually passed to `createMediaRouter`) `usage` into the media router.
