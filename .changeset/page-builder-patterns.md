---
"@cogenta/core": minor
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 43 sub-chantiers A, B, E, F (Cogenta Page Builder — motifs, copier/coller, verrouillage/sélection multiple, import/export) — extends the L16 visual page builder without touching contract A, B, C or D.

**Sub-chantier A — pattern/model library.** `@cogenta/schema` gains a new
one-fixed-table store (`ensurePatternTables`/`createPatternStore`,
`cogenta_patterns`), the same "not schema-declared, one fixed pair/table"
treatment `menu-tables.ts` already gets — a pattern is a reusable *shape* an
editor composes from existing blocks, never a thirteenth block type. Two
kinds share the table: a **motif** (a few blocks, added to whatever a page
already has) and a **modèle de page complet** (replaces the whole block
zone, and only ever behind explicit confirmation in the admin — never
silently). `@cogenta/api` gains `createPatternRouter` (`/api/patterns`,
admin/editor only on every method, mirroring `redirect-router.ts`'s fixed
door) with two new error codes on `@cogenta/core`, `PATTERN_UNKNOWN`/`PATTERN_INVALID`. A
pattern's blocks are validated against the site's block registry
(`@cogenta/blocks`'s `vocabularyRegistry` by default, overridable) exactly
the way a clipboard paste is: one unknown block type refuses the whole
pattern, never a partial or best-effort insert. `@cogenta/cli` wires both
into `cogenta serve` (`ensurePatternTables` at boot, `/api/patterns` mounted
next to `/api/menus`) and into `cogenta backup`/`cogenta restore`
(`PATTERN_TABLE` added to the table list `buildBackupTables` already
assembles).

**Sub-chantier B — copy/paste and reusable blocks.** Purely client-side
(`@cogenta/admin`, no published package touched): `Ctrl/⌘+C`/`Ctrl/⌘+V` on
the builder's block selection, through the browser clipboard as
`cogenta/blocks@1`-tagged JSON, validated the same way on paste (unknown
block type named and refused). "Blocs réutilisables" is deliberately not a
second mechanism — fiche 05 task 3's own recommendation — a single-block
pattern already covers it: insertion is always a copy, never a live
reference, so there is nothing in contract B to touch.

**Sub-chantier E — lock and multi-select.** Also admin-only. A lock is a
session-only admin flag, never persisted to contract B or the server; a
locked block cannot be moved (by its own controls, by a neighbour's move
displacing it, or as part of a group move) or removed. Multi-select is
scoped to the outline list (`Shift`+click), never the preview — the same
`Shift`+click a keyboard/switch user can also drive, with named group
buttons doubling every drag, per the lot's own rule. A group move/remove is
always one undo step, never one per block.

**Sub-chantier F — import/export.** A pattern library round-trips through a
versioned JSON file (`cogenta/pattern-file@1`), validated block-by-block on
import the same way a save is. `provenance`/`provenanceDetail` follow
contract A's own values (`human`/`assisted`/`generated`) — a pattern an
agent generates is never indistinguishable from one a person authored by
hand.

`cogenta_patterns` has the same one-suite-run-four-times contract test as
`taxonomy-store.ts`/`content-store.ts` (`pattern-store.contract.ts`,
SQLite as a unit test and Postgres/MySQL/MariaDB as loud-skip integration
tests) — deliberately not left SQLite-only the way `menu-store.ts`'s own
table predates this discipline and still is.

No contract touched: A, B, C and D are all unchanged. `PermissionLayer`
gains no new method — pattern management is a fixed admin/editor rule, the
same shape `redirectRouter`/`menuRouter` already use, and *inserting* a
pattern's blocks into an entry still goes through the entry's own existing
`update` permission (`POST /api/builder/render`'s `PermissionLayer.assert`),
unchanged.
