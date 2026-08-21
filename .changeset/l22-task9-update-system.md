---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Add the update system (L22 task 9): checking npm for a newer `@cogenta/core`/
`@cogenta/cli`, and applying one with a mandatory restore point first — never an
update with no safety net.

`@cogenta/core` gains `readOwnPackageVersion` (self-describing package version,
read from a package's own `package.json`, never bundled at build time) and
`getCoreVersion`, its own version computed with it — **lazily, cached after the
first real call, never a top-level constant**: a top-level `CORE_VERSION =
readOwnPackageVersion(...)` was the first design, and it broke every
`@cogenta/admin` test that happened to pull `@cogenta/core` in transitively,
because that suite's `import.meta.url` is not a `file://` URL under
Vitest+jsdom's Vite transform. `@cogenta/core` is imported (for types) by
enough of this monorepo, including browser-bundled code, that nothing at its
top level may assume a real Node `file://` module URL — fixed before it ever
shipped, but worth naming so the next self-describing constant doesn't repeat
it. New error codes: `PACKAGE_VERSION_UNREADABLE`, `UPDATE_CHECK_FAILED`,
`UPDATE_RESTORE_POINT_FAILED`, `UPDATE_APPLY_FAILED`, `UPDATE_NOT_AVAILABLE`,
`UPDATE_CONFIRMATION_REQUIRED`, `UPDATE_POLICY_INVALID`.

`@cogenta/schema` gains one new site-settings-registry entry,
`updates.autoUpdatePolicy` (`off`/`patch`/`patch-minor`/`patch-minor-major`, off by
default) — a normal editorial setting through the existing generic settings store,
no new persistence mechanism.

`@cogenta/api` gains `createUpdateRouter`: `GET /api/updates/status` (a live
version check against npm, per package), `GET /api/updates/history` (past
checks/applies plus the restore points they took), and `POST /api/updates/apply`
(admin-only, every route).

`@cogenta/cli` gains `cogenta update check|apply|history`, wired the same way into
`cogenta serve`'s admin API and into a new daily `updates-auto-check` scheduled
task that honours `updates.autoUpdatePolicy` — never auto-applies a version whose
changelog scan flagged a frozen contract, and never re-applies the same version on
every tick after a successful auto-apply (this process's own version constant
cannot change without an actual restart).

A **real bug fix**, found while wiring `getCliVersion`: `bin.ts` never passed its
own version to `run()`, so `cogenta version`/`cogenta --version` always printed the
fallback `"0.0.0"` regardless of what was actually installed. Fixed.

**Contract-risk detection is real but honestly limited.** It reads the target
version's own published `CHANGELOG.md`, fetched from its npm tarball
(`registry.npmjs.org` only, a small zero-dependency ustar/pax reader — no `tar`
dependency, R9) and scanned for a frozen-contract mention. `@cogenta/core` and
`@cogenta/cli` add `CHANGELOG.md` to their own `"files"` for this to work — every
version already published before this ships has no `CHANGELOG.md` in its tarball
(verified with a real `npm pack` while building this), so the check reports an
honest "could not determine" for those rather than a false "no risk found." Even
once readable, this is a keyword scan of prose, not comprehension — a strong hint
an admin reviews before confirming, never a certification.

**Out of scope, deliberately**: this updates a site's npm packages only — `cogenta
build`/`deploy` remain honestly deferred (L9), and no migration ever runs
automatically (`cogenta migrate status`/`migrate up` stay a separate, explicitly
confirmed step, exactly as today).
