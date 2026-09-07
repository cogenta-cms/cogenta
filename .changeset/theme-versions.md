---
'@cogenta/cli': minor
---

Fiche 73 task 6 — versions (§ 3.5): `listThemeVersions`/`restoreThemeVersion` in
`theme-sandbox.ts`.

The timestamped archive task 5's deploy pipeline already writes into
`themes/.versions/<name>/<timestamp>/` on every redeploy is now listable
(`listThemeVersions`, newest first, empty when a theme has never been redeployed —
never an error) and restorable (`restoreThemeVersion`) — "même geste conceptuel que
le retour arrière déjà existant pour les mises à jour de flotte" (§ 3.5), on an
explicit human gesture, never automatic.

A restore is itself undoable: the version it replaces is archived in turn, using the
exact same archive-then-remove ordering (never overwritten in place) task 5 already
established — now shared as `archiveCurrentVersion`, a single helper both
`deployThemeFromSandbox` and `restoreThemeVersion` call. A restored version is not
re-scanned by `verifyTheme`: it already passed that check the moment it was first
deployed, and nothing else in this module ever writes into `themes/.versions/`.

4 new real tests (`packages/cli/test/theme-sandbox.test.ts`): no versions for an
untouched theme, versions accumulate newest-first across redeploys, a full
restore-and-verify-it's-undoable round trip, and a refusal for an id that does not
exist (touching nothing).

No admin screen for this yet — same honest, documented gap as tasks 4-5: the
mechanism is delivered and tested; wiring it into the admin is separate follow-on
work.
