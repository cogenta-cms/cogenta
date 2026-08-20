---
'@cogenta/core': minor
'@cogenta/plugins': minor
'@cogenta/api': minor
---

Fiche 29 — the marketplace gains a real "installed extensions" screen: what
runs, in which version, with which permissions, and how it's been behaving.

**Breaking, in the pre-alpha sense already established for this project (no
package has ever used `major`, and one would jump straight to `1.0.0`,
contradicting "pre-alpha"; the breaking shape is called out here instead):**
`@cogenta/plugins`' `MarketplaceInstallRecord` gains a required `enabled`
field, and `MarketplacePreview` gains required `engineCompatible`,
`latestVersion` and `source` fields — anyone constructing these shapes by
hand (a test double, a custom `MarketplaceInstaller` implementation) needs
those fields too. `MarketplaceInstaller` gains two new required methods,
`activate`/`deactivate`, and `uninstall`'s signature grows an optional
`{ removeData?: boolean }` second argument. `@cogenta/api`'s
`marketplace-router.ts` mirrors the same shapes structurally, as it always
has.

New, additive:

- `@cogenta/plugins`: `createPluginUsageStore` (`permissions/usage.ts`) —
  accumulates real per-run duration, call count, and outcome (ok / error /
  timeout / memory / crash) per plugin, fed by `runPlugin` when given a
  `usageStore` option. `IsolatedRunResult` gains a real, always-present
  `durationMs`. `PluginGrantStore` gains `revokeAll`. The marketplace
  installer gains a manual `enabled` toggle (`activate`/`deactivate`,
  independent of `PluginDisableStore`'s automatic timeout/memory/crash
  disable), an `engineVersion` option that refuses an incompatible install
  or update with the new `MARKETPLACE_ENGINE_INCOMPATIBLE` code (only once a
  caller actually configures a real Cogenta version — the placeholder
  default never fabricates a refusal), and `uninstall(id, { removeData:
  true })`, which also revokes grants and clears the disable/usage records.
  `MarketplaceCatalogEntry` gains an optional `author`, and
  `MarketplaceChangelogEntry` an optional `releasedAt`.
- `@cogenta/api`: `GET /api/marketplace/installed` (capabilities, disabled
  state, usage, update availability, per item), `GET /api/marketplace/updates`
  and `POST /api/marketplace/updates/apply` (grouped update that always
  skips — never silently applies — anything that would widen permissions),
  `POST /api/marketplace/items/{id}/activate` and `.../deactivate`,
  `POST .../uninstall` now accepts `{ removeData: boolean }` in its body.
- `@cogenta/core`: new `MARKETPLACE_ENGINE_INCOMPATIBLE` error code, mapped
  to a `422` in `@cogenta/api`'s `statusFor`.

Honest limitation, not an oversight: nothing in this repository actually
calls `runPlugin` yet (no live `AgentRegistry` exists anywhere, the same
R2-honest gap already noted since L5) — the new usage store is real, tested
end to end, and wired into `cogenta serve`, but stays empty on a real
deployment until a real plugin-execution pipeline lands. The installed
extensions screen says "never run yet" rather than inventing a number.
