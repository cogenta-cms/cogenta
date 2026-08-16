---
'@cogenta/plugins': minor
'@cogenta/api': minor
'@cogenta/core': minor
---

L17 tasks 1-4: a local/embedded marketplace catalog with one-click install,
scoped deliberately without a real remote registry service — L13 task 8 (API
keys), which the lot names as the dependency for a distant marketplace, was
never built in this repository.

`@cogenta/plugins` gains `createMarketplaceCatalog` (an in-memory, searchable,
category-filterable directory the caller assembles — not a fetch to any
external host) and `createMarketplaceInstaller`, plus `loadMarketplacePlugin`:
a stricter sibling of `loadPlugin` that treats every reference as
`registry`-trust unconditionally, so a marketplace item never takes the
`local`/dev-mode shortcut that would otherwise skip signature verification for
a catalog entry that happens to point at a local directory.

**The one line the whole task hinges on**: `MarketplaceInstaller.install`
always calls `loadMarketplacePlugin`, which always verifies signature against
the trusted registry keys — there is no parameter anywhere in this path that
can skip that call, and a missing or invalid signature throws before anything
is persisted. Only `kind: 'plugin'` installs for now (`MARKETPLACE_KIND_UNSUPPORTED`
otherwise) — themes/skins/skills keep using their own existing registries
(`createThemeRegistry`/`createSkinGallery`/`createSkillRegistry`).

`MarketplaceInstaller.update` re-verifies the signature of the new reference,
computes newly-declared capabilities against the plugin's existing grants
(`detectCapabilitiesNeedingApproval`, unchanged from L7), and refuses
(`MARKETPLACE_UPDATE_REQUIRES_APPROVAL`) unless the caller explicitly passes
`confirmPendingPermissions: true` — and even then, no capability is
auto-granted; `PluginGrantStore.grant` stays a separate, explicit step.

`@cogenta/api` gains `createMarketplaceRouter` (`/api/marketplace/items`,
admin-only, structurally typed against `@cogenta/plugins` rather than
depending on it at runtime) with list/detail/install/update/uninstall routes.
The detail route reuses `describeCapability` (L7 task 7) so a plugin's
requested capabilities read in plain language, the same sentences the
existing permission-review screen already renders.

`@cogenta/core` gains the error codes this needs:
`MARKETPLACE_ITEM_NOT_FOUND`, `MARKETPLACE_KIND_UNSUPPORTED`,
`MARKETPLACE_ALREADY_INSTALLED`, `MARKETPLACE_NOT_INSTALLED`,
`MARKETPLACE_UPDATE_REQUIRES_APPROVAL` — and `PLUGIN_SIGNATURE_MISSING`/
`PLUGIN_SIGNATURE_INVALID`/`PLUGIN_SOURCE_NOT_FOUND`/`PLUGIN_MANIFEST_INVALID`
(existing L7 codes, never before mapped to an HTTP status because no REST
route threw them until now) gain entries in `statusFor` (422/404/422).

**Not done, by explicit scope cut under a hard deadline**: `cogenta serve`
does not yet mount this router, so the catalog/installer above are complete,
independently tested, and ready to wire, but not yet reachable over HTTP from
a running site — the same honest gap the codebase already tolerates elsewhere
(`cogenta build`/`deploy`/`theme`, L9 task 9) rather than a stub. Bundled
updates across multiple items and the commercial (paid extension) track named
in the lot doc are both out of scope for this pass.
