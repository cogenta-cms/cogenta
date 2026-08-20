---
"@cogenta/core": minor
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/auth": patch
"@cogenta/agents": patch
---

Editorial workflow and owner permission (`schema@2.1`, ADR-0027, fiche 37 + fiche 19
task 5).

Strictly additive — a site that never declares `workflow: { enabled: true }` on a
collection, and never uses the `{ roles, own }` permission form, behaves identically
to before this release. Proved by a compatibility test: a client reading only
`status` gets byte-identical values.

- `reviewState` (`none`/`pending`/`changes-requested`/`approved`) and
  `assignedReviewer` join the system fields, orthogonal to `status` — the same design
  ADR-0022 gave `deletedAt`. `approved` is not `published`: approving authorises,
  `publish` remains the action that makes an entry public.
- A closed, server-side transition table (`submit`/`approve`/`requestChanges`), each
  gated by its own contract A action (`update` for submit, `publish` for the other
  two) — never duplicated by a client.
- New `ContentStore` methods `submitForReview`/`approveReview`/`requestReviewChanges`/
  `assignReviewer`, and new REST routes `POST .../submit`, `.../approve`,
  `.../request-changes`, `.../assign-reviewer` — each its own path, never a second
  meaning for an existing verb (ADR-0022's own lesson for `purge`).
- `CollectionPermissionRule` gains the object form `{ roles, own? }` alongside the
  plain role-name array, which stays valid. `own: true` scopes every listed role to
  entries the acting account created; `PermissionLayer.can()`/`.assert()` take an
  optional `ownerId` to check it.
- Reversible, non-destructive migration (`schema21Migration`) adding `review_state`
  (`not null default 'none'`) and a nullable `assigned_reviewer` to every collection.
- Admin: a review queue screen (three tabs — assigned to me / all pending / my
  submissions — aggregated server-side via a new `GET /api/review`), a pending-count
  nav badge, and an entry editor sidebar showing workflow state, assigned reviewer,
  and a contextual action button that replaces the absent Publish button with
  "Submit for review" for an actor without `publish`.

Postgres/MySQL/MariaDB integration test files are written
(`packages/schema/test/integration/schema-2-1-migration.test.ts`) but not executed
this session — Docker unavailable; they skip loudly, naming the missing variable.
