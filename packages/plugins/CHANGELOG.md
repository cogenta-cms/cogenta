# @cogenta/plugins

## 0.3.0

### Minor Changes

- 750a10b: L24 task 4: the admin "Skills" screen (`AgentSkillStore`, L22 task 1bis) now stores each skill the same way L7's marketplace registry already does — `<dir>/<id>/SKILL.md` (frontmatter + body), the exact format a real Claude Code/Codex skill ships as — instead of one JSON file per record. The point is portability: a `SKILL.md` copied verbatim from `.claude/skills/` (or any other standard agent) drops straight into the store's directory and reads back correctly.
  
  `@cogenta/agents`: `parseSkillFile` (`skills/frontmatter.ts`) no longer requires a `version` field — a real Claude Code/Codex skill only ever carries `name` and `description`, and requiring a third field it doesn't have refused the exact copy-paste this task exists to support. `SkillMetadata.version` becomes optional (`file-store.ts`'s marketplace registry, which does need one to compare installed-vs-available, still writes it — this only relaxes what a skill *file* is allowed to omit). New `renderSkillFile`, the inverse of `parseSkillFile`, now exported alongside it. `AgentSkillStore`'s own contract (`list`/`get`/`create`/`update`/`remove`, and the shape of `AgentSkillInput`/`AgentSkillPatch`) is unchanged; `AgentSkill` gains a `content` field — the exact `SKILL.md` text the record renders to, always the canonical rendering of the structured fields, never a second independently-edited copy. The `enabledByDefault`/`builtin`/`createdAt`/`updatedAt` bookkeeping a portable `SKILL.md` has no room for lives in a sidecar `.meta.json` next to `SKILL.md`, deliberately kept out of the frontmatter — folding it in would leave every skill this store touches carrying Cogenta-only keys forever, defeating the point of the migration. A `SKILL.md` dropped into the store's directory with no sidecar reads fine, with sensible defaults, rather than failing.
  
  `@cogenta/api`: `/api/agent-skills`'s `POST`/`PATCH` now take `{ content: string }` (a raw `SKILL.md`) instead of separate `name`/`description`/`instructions` fields — parsed server-side with the same `parseSkillFile`, so a malformed submission fails with the same `SKILL_DEFINITION_INVALID` a file-based store would raise (newly mapped to HTTP 400 in `statusFor`). Every response now also carries `content`. **Breaking wire change** for any caller of this admin-only route (the admin app is the only one, and is updated in this same change).
  
  `@cogenta/cli`: no interface change — `agent-runtime.ts`'s use of `createFileAgentSkillStore`/`ensureBuiltinAgentSkills` is unaffected, since `AgentSkillStore`'s own contract did not change; called out here only because the on-disk format of a site's `.cogenta/agents-runtime/skills/` directory changes on next write (existing sites keep working — nothing migrates old `<id>.json` records automatically, since none exist yet on any real site this project has shipped to).
  
  `@cogenta/plugins`: `createSkillRegistry`'s marketplace submission handler (`registries/skills.ts`) now records a submission with no `version` field (a real Claude Code/Codex `SKILL.md`) as `skillVersion: null` instead of failing to compile against the now-optional `SkillMetadata.version` — no behaviour change for a submission that does carry one.
- 562c9c1: Add the "Apparence" admin screen (fiche 14) — the CMS's most-differentiating
  feature, AI skin generation, was previously exposed only through the CLI.
  
  - `@cogenta/render` gains `mergeSkinTokens` (`SkinTokenOverrides`): overlays a
    partial token tree onto a complete base skin, group by group, key by key.
  - `@cogenta/schema` gains `createThemeStore`/`ensureThemeTable` — one row of
    theme overrides (a partial token overlay, additional CSS, and four identity
    media references), the database half of the two-source-of-truth design
    task 0 settles on: `theme.tokens.json` stays the versioned file default,
    the database holds what an `admin` changed from the admin screen.
  - `@cogenta/plugins`'s `SkinGalleryEntry` now carries the accepted skin's real
    `tokens` (`null` for a rejected entry) — needed to render a swatch or apply
    a gallery skin, previously only metadata.
  - `@cogenta/api` gains `createThemeRouter` (`GET/PUT/DELETE /api/theme[/overrides]`,
    `GET /api/theme/skins`, `POST /api/theme/skins/:id/apply`,
    `POST /api/theme/generate`, `POST /api/theme/export`), plus the
    `SKIN_*`/`THEME_*` error-code → HTTP-status mappings it needs.
  - `@cogenta/cli` wires it all into `cogenta serve`/`dev`: `resolveStyles()`
    recomputes the served stylesheet on every request (file tokens merged with
    saved overrides plus additional CSS), which is what makes a saved change
    visible on the very next page view instead of only after a restart — the
    "hot swap" contract D already promised for the file alone. A new
    `POST /api/theme/preview` route renders the real home page with a candidate
    overlay nobody has saved yet, the same iframe-on-the-real-render decision
    L16 made for the page builder. Exporting the merged tokens back into
    `theme.tokens.json` is gated to `cogenta dev` only, mirroring the
    ADR-0010 rule L19's site-plan applier already uses for the schema file.
  
  R2 verified: without an LLM provider, `GET /api/theme` reports
  `aiAvailable: false` and the admin's AI section does not render at all — no
  error, no dead link. R6 verified: an AI-generated candidate or a chosen
  gallery skin is never applied automatically; a save is always a separate,
  explicit action.
- 6e5df34: Fiche 29 — the marketplace gains a real "installed extensions" screen: what
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
- 46572ba: Add the admin notification center (fiche 38): a bell with an unread count, filterable
  by severity/period, bulk mark-as-read; new notice sources (plugin auto-disabled,
  scheduled publication failed); channel-bridged notices reusing `@cogenta/channels`'
  existing message formats, grouping and identity-linking (no second mechanism); and a
  per-severity channel routing settings screen.
  
  `@cogenta/schema` gains `scheduled-publish-failures` store used by the new notice
  source. `@cogenta/api` gains a real `@cogenta/channels` dependency, new notice-router
  routes for channel settings and notice history, and a `plugin-disabled`/
  `scheduled-publish-failed` notice source pair. `@cogenta/plugins` exposes disabled-state
  data the new notice source reads. `@cogenta/channels`' preference types gain the field
  the settings screen needs.

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [08e394b]
- Updated dependencies [d0a3250]
- Updated dependencies [0e88f30]
- Updated dependencies [750a10b]
- Updated dependencies [08e394b]
- Updated dependencies [edd0787]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [7a59646]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [a15b1ae]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [86fc9cf]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [835d736]
- Updated dependencies [cf005d4]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
  - @cogenta/agents@0.3.0
  - @cogenta/render@0.2.0

## 0.2.0

### Minor Changes

- [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L17 tasks 1-4: a local/embedded marketplace catalog with one-click install,
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

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0
  - @cogenta/agents@0.2.1
  - @cogenta/render@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`809baee`](https://github.com/cogenta-cms/cogenta/commit/809baee0b47e48aea06235a97c0da29c7ba4b06c), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06), [`a332e41`](https://github.com/cogenta-cms/cogenta/commit/a332e416bfe08a226756451624b6344e7c6b7516), [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc), [`ade7b38`](https://github.com/cogenta-cms/cogenta/commit/ade7b3807fd273e56bcbe7499eb83374a592d35f)]:
  - @cogenta/core@0.3.0
  - @cogenta/agents@0.2.0
  - @cogenta/render@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2
  - @cogenta/render@0.1.2

## 0.1.0

### Minor Changes

- [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L7 task 4: the real, capability-gated SDK a sandboxed plugin actually calls.
  A small starter set — `content.read`, `http.fetch:<domain>`,
  `storage.read:<prefix>`/`storage.write:<prefix>` — each backed by a real
  host-side handler (`packages/plugins/src/host/capabilities.ts`) reached
  through a real bidirectional RPC extension of task 3's message protocol
  (`sdk-call`/`sdk-result`/`sdk-error`).
  
  Every handler re-verifies the SPECIFIC request (the exact requested domain,
  the exact storage key) against the SPECIFIC granted capability parameter —
  never just "was this capability name granted at all." A plugin granted
  `http.fetch:api.example.com` cannot use its own SDK method to reach a
  different domain; a plugin granted `storage.write:plugins/<name>` cannot
  escape that prefix, including via `../` traversal.
  
  "Une méthode non accordée est absente de l'objet SDK, pas seulement
  refusée" (explicit acceptance criterion) is enforced structurally: the
  guest-side sandbox (`packages/plugins/src/guest/sandbox-entry.mjs`) only
  ever assigns a method key onto the `sdk` object for a capability actually
  present in the granted list — a non-granted method is a genuinely missing
  object key, not a present function that throws.
  
  One new `@cogenta/core` error code: `PLUGIN_CAPABILITY_REFUSED`.

- [`4ba88c1`](https://github.com/cogenta-cms/cogenta/commit/4ba88c10d9b1e0ba02107f7ba3cd6f56cfedaac5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `loadPlugin` (L7 task 2): resolves a plugin reference (a local path or a
  registry package name — mirroring `@cogenta/core`'s `cogenta.config.mjs`
  loading convention exactly, `plugin.manifest.{ts,mts,js,mjs}` checked in
  order), loads its manifest via a real dynamic `import()`, re-validates it
  through `definePlugin` (task 1), and reports engine compatibility using a
  new zero-dependency semver-range matcher (`satisfiesRange`, `^`/`~`/exact/
  compound comparator ranges — no `semver` npm dependency, per R9). Executes
  no plugin code beyond importing the manifest module — worker isolation is
  task 3. A git-sourced reference (`git+...`, `github:...`) is recognised and
  refused honestly rather than pretending to clone it. Four new
  `@cogenta/core` error codes: `PLUGIN_SOURCE_NOT_FOUND`,
  `PLUGIN_MANIFEST_FILE_NOT_FOUND`, `PLUGIN_MANIFEST_LOAD_FAILED`,
  `PLUGIN_MANIFEST_EXPORT_INVALID`.

- [`835fe81`](https://github.com/cogenta-cms/cogenta/commit/835fe81bad7678bb8f9c68c98dba2767c07f67ba) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package: `@cogenta/plugins`. `definePlugin` — the plugin manifest schema
  and validator (L7 task 1). Every hard-refusal rule the lot specifies is
  enforced: `http.fetch` without an explicit domain (or with `*`) is refused,
  a `storage.read`/`storage.write` capability outside the plugin's own
  `plugins/<name>/` prefix is refused, an unknown capability name is refused,
  and a block provision without a `fallback` is refused. The capability
  vocabulary is grounded in contract C's frozen tool-permission taxonomy
  (`content.*`, `media.*`, `http.fetch`, `channel.send`, …) rather than a
  parallel invention, plus `storage.read`/`storage.write` for plugins' own
  prefix-confined storage. Every validation issue is reported at once, same
  reasoning as `@cogenta/schema`'s `schemaError`.

- [`b45ee25`](https://github.com/cogenta-cms/cogenta/commit/b45ee25b22687adbb1364017d9b09492edf645ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L7 task 5: "Traduction capacités → objet SDK, avec absence des méthodes non
  accordées" — the real permission-grant data layer task 4's `buildSdk` was
  missing, and the mechanism that makes plugin updates safe.
  
  `PluginGrantStore` (`packages/plugins/src/permissions/grants.ts`) persists
  per-`(pluginName, exactCapabilityString)` approvals — `http.fetch:api.exemple.com`
  being granted never implicitly covers `http.fetch:evil.com`, even though
  both share the bare name `http.fetch`, because grants are keyed to the exact
  string, not the bare capability name.
  
  `resolveGrantedCapabilities(manifest, grants)` is the real translation the
  task title names: the intersection of what a manifest currently declares and
  what has actually been approved. A stale grant for a capability the current
  manifest no longer declares never leaks through; a declared-but-unapproved
  capability is never included.
  
  "Une nouvelle version demandant plus de permissions ne doit jamais
  s'installer automatiquement" (a named pitfall) falls out of that
  intersection by construction — a newly-declared capability has no matching
  grant row yet, so it is silently absent from the resolved list (and
  therefore from the SDK, per task 4's "absent, not refused" property) until
  someone calls `grant()` for it. `detectCapabilitiesNeedingApproval` makes
  that "needs fresh approval" set an explicit, testable value a future
  permission screen (task 7) can read.
  
  `runPlugin(manifest, code, grants, options)` is the new real entry point in
  `packages/plugins/src/host/worker-runner.ts` — it computes
  `grantedCapabilities` itself via `resolveGrantedCapabilities` rather than
  accepting an externally-decided list, closing the placeholder task 4 left
  open.

- [`765b588`](https://github.com/cogenta-cms/cogenta/commit/765b588ae2aa899d6496da26c22dc0af3e572185) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L7 task 8: "Révision et révocation de permissions après installation."
  
  `@cogenta/plugins` gains `listGrantedCapabilities`/`revokeCapability`/
  `describePendingApproval` (`permissions/review.ts`) — real post-install
  review functions assembled entirely from task 5's `PluginGrantStore`/
  `resolveGrantedCapabilities`/`detectCapabilitiesNeedingApproval` and task
  7's `describeCapability`, no new persistence or translation logic.
  `revokeCapability` proves the end-to-end property that matters: after
  revocation, `resolveGrantedCapabilities` genuinely excludes the capability
  (the SDK method becomes absent again, not merely "marked revoked").
  
  `@cogenta/admin` gains `PluginGrantedPermissions` — the already-installed
  counterpart to task 7's install-time `PluginPermissionReview`, listing
  current grants with a real revoke action per item, plus a clearly
  separated "new permissions requested" section (reusing
  `PluginPermissionReview` itself) when a plugin update declares a
  capability beyond what's already granted. No live plugin-list screen
  exists yet (tasks 12/13) — this is the real, tested, prop-driven
  component that screen will render.

- [`9bf5e7b`](https://github.com/cogenta-cms/cogenta/commit/9bf5e7b08ae414f1ced40ebbd0ad77143ac88102) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L7 task 7 — "Écran de permissions en langage clair."
  
  - `describeCapability` (`@cogenta/plugins`) translates every capability in
    the frozen vocabulary (`PLUGIN_CAPABILITY_NAMES`) into a plain-language
    French sentence plus a `low`/`medium`/`high` risk level and category —
    never a raw technical identifier. Bypass-review or destructive
    capabilities (`content.publish`, `content.delete`, `site.config_write`,
    `deploy.trigger`, `agent.delegate`, `memory.write`) are `high` risk. A
    capability outside the known vocabulary throws rather than falling back
    to a generic, identifier-adjacent sentence. Proven by a real test that
    mechanically checks every real vocabulary entry's sentence for raw
    fragment leaks (`content.`, `http.fetch:`, `_draft`, etc.), not just the
    lot doc's two literal examples.
  - `PluginPermissionReview` (`@cogenta/admin`) is a purely presentational,
    prop-driven component rendering already-translated capability
    descriptions — no hard dependency on `@cogenta/plugins`' types (mirrors
    this app's established pattern of local, structural types for backend
    data, e.g. `content-client.ts`'s `ContentBlock`). The per-item checklist
    is the default, prominent path; "approve all without reading" exists as a
    secondary action, never primary — "l'installation sans lecture est
    possible, mais on ne la facilite pas." A checked high-risk item requires
    an explicit second confirmation before it can be approved. No install
    flow is wired to this component yet (no live plugin registry exists
    anywhere in this codebase) — it renders whatever items it's given.
  - Task 5's `PluginGrantStore.revoke` already covers task 8's data-layer
    need ("révisables après installation, et révocables") — this screen's
    translation layer is designed to be reused by that later review screen
    directly, not rebuilt.

- [`71a3b7f`](https://github.com/cogenta-cms/cogenta/commit/71a3b7f34faee420bc850f3666188de5a3362204) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/plugins` gains the plugins registry (`createPluginRegistry`,
  `packages/plugins/src/registries/plugins.ts`), the fourth and last of the
  registries named in the lot's own "## Registres" table — and the only one
  requiring all three named gates at once: "Signature, manifeste, revue."
  
  - **Signature** — checked first, against the raw, not-yet-validated
    manifest content, reusing task 9/12's generalized Ed25519 primitive
    (`verifyContentAgainstTrustedKeys`) exactly. A missing or untrusted-key
    signature is refused before any structural inspection runs, so an
    attacker without a valid signature can never use manifest-validation
    error messages to probe this registry's rules.
  - **Manifeste** — task 1's real `definePlugin`, called unchanged: the same
    four hard refusals (unscoped `http.fetch`, storage outside the plugin's
    own prefix, unknown capability, block without `fallback`) and every
    structural rule apply exactly as they would to a manifest loaded from
    disk. No manifest rule was re-implemented.
  - **Revue** — a submission clearing both automatic gates reaches `pending`,
    mirroring the skills registry's (task 11) two-step state machine and its
    exact `{ok:false, reason:'already_decided', entry}` discriminated result
    for a repeated review. Plugins execute code — the one property that
    makes this the only registry with no automatic-only path anywhere in it.
  - Registry entries are bookkeeping-only in this pass: an `accepted` entry
    does not automatically become loadable via `loadPlugin`/`runPlugin`.
    No real plugin registry service/HTTP endpoint exists anywhere yet (same
    honest pre-alpha scoping every signing/registry task in this lot has
    kept) — `loadPlugin` resolves from a local path or a package name, not
    from a submitted-content blob, so wiring "accepted → installable" is a
    real, separate integration task for whenever a registry service exists,
    not silently assumed here.
  - Persisted via `ensureRegistryTables`, extended a fourth time with the
    identical `create table if not exists` pattern — no new table-creation
    abstraction, per the reasoning already recorded at tasks 10-12.
  
  No new `@cogenta/core` error codes — this registry reuses `PLUGIN_MANIFEST_INVALID` (task 1) and `PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID` (task 9) as-is.

- [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `runPlugin` (L7 task 6) now enforces the lot's own words in full: "un plugin
  qui dépasse son temps ou sa mémoire est tué et désactivé, avec alerte. Il ne
  peut pas faire tomber le CMS."
  
  - A worker failure is now classified (`IsolatedRunResult.reason`:
    `'timeout' | 'memory' | 'crash'`) — `'memory'` is detected from Node's
    real `resourceLimits` heap-violation error message, `'timeout'` from the
    existing kill switch, everything else is `'crash'`.
  - Only a `'timeout'` or `'memory'` violation disables the plugin — an
    ordinary thrown error never does. Disablement is real and persisted
    (`createPluginDisableStore`, `cogenta_plugin_disabled` table, mirroring
    `cogenta_plugin_grants`'s `ensurePluginTables` pattern). `runPlugin` now
    requires a `disableStore` and refuses (`PLUGIN_DISABLED`, a new
    `@cogenta/core` error code) to even spawn a worker for an already-disabled
    plugin — checked before every run, not just after a violation.
  - The "avec alerte" half is a structural callback (`onPluginDisabled`), not
    a hard dependency on `@cogenta/channels` or any specific transport —
    wiring a disablement to a real notification is an integration decision
    for whatever assembles a site.
  - Proven by real, worker-based tests: a genuine heap-exhaustion fixture
    trips the real `resourceLimits` ceiling and is classified `'memory'`; the
    host process is proven to survive and remain usable (a follow-up run
    succeeds immediately after either violation type); a disabled plugin's
    next run attempt is refused before a worker is spawned; a human can
    re-enable a disabled plugin.

- [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Adds L7 task 9: real signature verification for registry-sourced plugins,
  per "## Signature" (docs/lots/L7-extensibilite.md): "Une signature invalide
  bloque, sans possibilité de passer outre depuis l'interface."
  
  - `packages/plugins/src/signing/` — real Ed25519 signing/verification via
    `node:crypto` (no new dependency): `generateSigningKeyPair`, `signManifest`
    (signs a deterministic, sorted-key canonicalization of the manifest),
    `verifyManifestSignature`/`verifyPluginSignature` (verifies against any
    of a list of trusted public keys), `readSignatureFile` (a signature travels
    as a sibling `<manifest>.sig` file, never embedded in the manifest shape).
  - `TRUSTED_REGISTRY_PUBLIC_KEYS` starts empty — no real plugin registry
    exists yet (pre-alpha), so every `registry`-source plugin fails
    verification by default rather than trusting a placeholder key.
  - `loadPlugin` (L7 task 2) now calls `resolveSignatureStatus` for every
    resolution: a `registry`-source plugin with a missing or invalid signature
    is hard-refused (`PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID`)
    before any plugin code is imported — there is no parameter anywhere that
    lets a caller force past this. A `local`/`git`-source plugin is allowed
    unsigned ("mode développement") and now carries a real `devMode: true`
    flag on `ResolvedPlugin` (plus `signatureVerified: boolean`) for a future
    admin banner to render as the lot's "avertissement permanent."
  
  Two new `@cogenta/core` error codes: `PLUGIN_SIGNATURE_MISSING`,
  `PLUGIN_SIGNATURE_INVALID`.

- [`6ef204b`](https://github.com/cogenta-cms/cogenta/commit/6ef204b9abdc035673f58c6b23511184c0025bef) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/plugins` gains a skills registry (`createSkillRegistry`,
  `packages/plugins/src/registries/skills.ts`), the second of the four
  registries named in the lot's own "## Registres" table — and the first with
  a genuinely different gate from the skins gallery (L7 task 10): "Revue de
  contenu" (content review), not automatic-only validation.
  
  - Reuses `@cogenta/agents`'s real `parseSkillFile` (new workspace
    dependency) as a necessary-but-not-sufficient automatic pre-check: a
    submission that doesn't even parse as a valid skill file is rejected
    immediately, with the real parse error, and never reaches `pending`.
    A submission that DOES parse still requires a real human decision
    (`review(id, 'accept' | 'reject', reviewerUserId, notes?)`) before it can
    be listed — unlike skins, there is no fully-automatic accept path.
  - Re-reviewing an already-decided submission returns a discriminated
    `{ok:false, reason:'already_decided', entry}` result carrying the prior
    decision rather than a raw error or a silent overwrite.
  - Persisted via `ensureRegistryTables` (extended, same `create table if not
    exists` pattern as the skins gallery — one migration-free function now
    owns both registry tables).
  - A shared `Registry<T>` abstraction was deliberately not built: the two
    registries' state machines are genuinely different shapes (skins: single
    automatic verdict; skills: automatic pre-check then a separate human
    decision), and forcing them into one generic type would cost more
    clarity than the small amount of duplicated submit/list/get shape saves.
    Revisit once the themes/plugins registries (tasks 12-13) exist.

- [`4cdac7b`](https://github.com/cogenta-cms/cogenta/commit/4cdac7b14fda33d071d68bd9780be33df974700e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Adds the skin gallery registry (L7 task 10): `createSkinGallery` submits a
  candidate token JSON, runs it through `@cogenta/render`'s real `validateSkin`
  (reused wholesale, not reimplemented) and stores the outcome — `accepted` or
  `rejected` with the specific real failure code and reason — with no
  pending/human-reviewed state, matching the lot's "sans revue humaine"
  requirement for this one registry kind. `listAccepted`/`get` read back
  gallery entries. `@cogenta/plugins` gains a real dependency on
  `@cogenta/render`.

- [`5f61177`](https://github.com/cogenta-cms/cogenta/commit/5f61177cc4f4accc736a494d6e72f25b84641a51) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/plugins` gains a themes registry (`createThemeRegistry`,
  `packages/plugins/src/registries/themes.ts`), the third of the four
  registries named in the lot's own "## Registres" table: "Signature, contrat
  vérifié" — a real, automatic-only two-gate decision, structurally different
  from both prior registries (skins: single automatic verdict, no signature;
  skills: automatic pre-check then a separate human decision).
  
  - **Signature** — task 9's Ed25519 primitive, generalized: `signManifest`/
    `verifyManifestSignature`/`verifyPluginSignature` are now thin wrappers
    over new generic `signContent`/`verifyContentSignature`/
    `verifyContentAgainstTrustedKeys` functions operating on any canonicalizable
    content, not just a `PluginManifest`. Checked first — an unsigned or
    untrusted-key theme is refused before any contract inspection runs.
  - **Contrat vérifié** — reuses `@cogenta/render`'s real, already-built
    contract D install check wholesale: `parseThemeManifest` (manifest
    structure), `verifyTheme` (every vocabulary block declared in
    `implements`, no forbidden import anywhere in the theme's real source
    tree — a submission now carries a real filesystem root, since this check
    scans real files, not inline JSON), and `validateSkin` on the theme's
    default `tokens.json` (same reuse `createSkinGallery`, L7 task 10,
    already established). No new contract logic was written — contract D
    already specified more than just the token schema (manifest shape,
    `implements` coverage, forbidden imports), and all of it was already real
    and tested in `@cogenta/render`, just never reused from `@cogenta/plugins`
    until now.
  - Persisted via `ensureRegistryTables` (extended a third time, same
    `create table if not exists` pattern). Final call on the shared
    `Registry<T>` abstraction question (raised, deferred, at each of tasks
    10/11): still not built — with three real, concrete instances now in
    hand, the honest finding is that the three registries' gates are
    genuinely different shapes (single automatic verdict / automatic-precheck
    + human review / signature + contract), so a generic wrapper would either
    leak into passing raw column lists (no real abstraction) or force
    dissimilar state machines into one shape. The real shared primitives
    (`identifier`/`sql`/`createIndexIfMissing`, and now the generalized
    signing functions) already are extracted; the remaining duplication
    (eight-line table declarations) is cheaper than a parameterised builder.
  
  One new `@cogenta/core` error code: `THEME_SIGNATURE_INVALID`.

- [`81b1514`](https://github.com/cogenta-cms/cogenta/commit/81b1514e64282eeb5d6a37930f04f0a956e35f6f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `runIsolated`/`runIsolatedOrThrow` (L7 task 3) — the real worker isolation
  boundary "tout plugin tiers s'exécute dans un worker séparé" requires.
  Combines `node:worker_threads` (spawned with `env: {}` so secrets and the
  host environment are never passed in, plus bounded `resourceLimits`) with a
  `node:vm` sandbox inside the worker whose global object has no `process`,
  no `require`, no `fetch`, and no dynamic `import()` (no
  `importModuleDynamically` callback is registered, and `codeGeneration:
  {strings: false}` blocks `eval`/`new Function` escape techniques). A
  timeout-based kill switch terminates a runaway worker. Four real, isolated
  hostile-code tests prove `fs`, undeclared network access, `process`, and a
  host-held secret are all unreachable from inside the sandbox — the lot's
  own explicit acceptance criteria. Measured isolation overhead (~46ms per
  call, one fresh Worker per call, no pooling) is documented. This task
  deliberately does not build the capability-gated SDK object (task 4/5) or
  the full resource-limit-and-disable policy (task 6) — only the isolation
  primitive those tasks build on.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`99aa9b2`](https://github.com/cogenta-cms/cogenta/commit/99aa9b2fb2bbedeacf658b57008a863f6af81d45), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
  - @cogenta/render@0.1.0
