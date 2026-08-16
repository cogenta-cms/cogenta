---
'@cogenta/api': minor
---

Add `unpublish` and `duplicate` REST routes, so the admin's editor can
finally offer status control and duplication

The audit's top finding on the admin: the content editor had no publication
control at all, even though `POST /{collection}/{id}/publish` has existed
since L2. Fixing that needed two more routes, both added the same way the
existing ones were:

- `POST /{collection}/{id}/unpublish` — the direct inverse of `publish`, so
  it is guarded by the `publish` action rather than a sixth verb (contract A's
  action vocabulary stays frozen at five, same reasoning `untrash`/`purge`
  reuse `delete`). Body: `{ status?: 'draft' | 'archived' }`, defaulting to
  `draft`.
- `POST /{collection}/{id}/duplicate` — wires up `ContentStore.duplicate()`
  (`@cogenta/schema`), which was already written and tested but never called
  by anything. Guarded by `create`, since a duplicate is a new entry, not a
  change to the source. Body: `{ values?: {...} }`, applied on top of the
  copied values (the same override contract `duplicate()` already exposes).

Both are tested role by role (refused for a role without the permission,
allowed for one with it) in `test/rest/publish-duplicate.test.ts`.

`@cogenta/admin`'s entry editor now shows a visible status control
(draft/published/archived) and a "Publish" button gated by the `publish`
permission, plus a "Duplicate" button gated by `create` — both calling these
routes. `@cogenta/admin` is unpublished, so no changeset entry for it.

Deliberately not done here: a fourth `scheduled` status in the admin. Contract
A already has it, and `@cogenta/schema` has a full queue-based scheduler for
it (`src/scheduling/publish.ts`), but nothing registers it in `cogenta serve`
— offering a date picker that silently did nothing would be dishonest UI.
Wiring the scheduler is separate follow-up work.
