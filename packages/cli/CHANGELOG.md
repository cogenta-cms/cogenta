# @cogenta/cli

## 0.5.0

### Minor Changes

- 154a751: Fiche 22 tâche 8 (finitions d'admin) — several small, independently useful
  changes across the published packages:
  
  `@cogenta/core`'s `package.json` now declares `"./package.json"` in its
  `exports` map, so a dependent (`@cogenta/cli`) can resolve its own real
  installed version through Node's standard ESM resolution instead of a
  hand-maintained copy. Purely additive; nothing else in the package changes.
  
  `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a `navigation` group and
  four new keys (`navigation.sectionOrder`, `navigation.hiddenSections`,
  `navigation.itemOrder`, `navigation.hiddenItems`) — site-wide admin sidebar
  reordering and hiding (e.g. "hide the Commerce section on a portfolio
  site"), stored the same comma-separated-list way `content.
  newEntryDefaultBlocks` already is. Additive to the registry; no existing key
  changes shape or default.
  
  `@cogenta/api`'s `ShellStatus` (and `createShellStatusRouter`'s
  `ShellStatusRouterOptions`) gains `cogentaVersion: string` — the installed
  `@cogenta/core` version, answered to every actor including an anonymous
  one (never secret), consumed by the admin footer/topbar. A caller that does
  not pass `cogentaVersion` gets `'0.0.0'` rather than `undefined`.
  
  `@cogenta/cli` gains `getCogentaVersion()` (`commands/cogenta-version.ts`),
  resolving `@cogenta/core`'s own `package.json` version through
  `import.meta.resolve` and caching it. `cogenta serve` now threads this
  version into `GET /api/shell-status` and, when Cogenta's own branding stays
  on, into the public site footer next to its existing credit — extending
  `ThemeRenderOptions`'s `BrandingSettings` with an optional `cogentaVersion`
  field, never duplicating the branding on/off logic itself.
  
  `@cogenta/theme-canonical`'s `base.css` gains a small `.cg-site-footer__version`
  rule for the version text above, and a `gap` on `.cg-site-footer__branding a`
  so the logo and the version sit apart cleanly — no structural change to the
  footer markup beyond the one optional `<span>`.
- 5c5ffbd: L21 task 2 — a runtime template + personalisation system for the admin's
  own interface, the counterpart `packages/admin/src/routes/appearance.tsx`
  already gave the public site (contract D) but the admin itself never had:
  before this, `theme.css` was a single hard-coded design with no selector
  and no override mechanism at all.
  
  **`@cogenta/core`:** two new error codes, `ADMIN_THEME_TEMPLATE_UNKNOWN`
  and `ADMIN_THEME_INVALID`.
  
  **`@cogenta/schema`:** a new `admin-theme-templates.ts` — two complete,
  built-in token sets (`ADMIN_THEME_TEMPLATES`): "Nightops" (the current
  dark-first, signal-green console — copied verbatim from `theme.css`) and
  "Atelier" (the warm, printed-paper design that shipped immediately before
  the Nightops reskin, recovered from git history rather than approximated
  from memory) — plus `adminThemeOverridesSchema`, the small, curated set of
  personalisation levers a template can be customised with (primary/
  background/text colour, display font, body font, corner radius, an
  optional logo media id) without ever rewriting the built-in template
  itself. `ensureAdminThemeTable`/`createAdminThemeStore` persist exactly one
  choice (a template id plus its overrides) in a new fixed table
  (`cogenta_admin_theme`, the same one-table-no-migration-file treatment
  `menu-tables.ts`/`site-settings-tables.ts` already use for admin-editable,
  non-schema-declared state).
  
  **`@cogenta/api`:** `createAdminThemeRouter` — `GET|PUT /api/admin-theme`.
  Read needs no session at all (the admin's own `/login` screen has to paint
  in the chosen template before one exists); write needs the `admin` role,
  checked by the router itself.
  
  **`@cogenta/cli`:** `cogenta serve` mounts the new store and router, and
  audits every successful `PUT` the same way `/api/settings` already does.
  
  No breaking changes — a site that never calls `PUT /api/admin-theme` keeps
  `theme.css`'s own "Nightops" defaults exactly as before. `@cogenta/admin`
  (private, no changeset) gains the settings screen ("Apparence de l'admin",
  deliberately a separate nav entry from the public site's own "Apparence"),
  `AdminThemeProvider` (injects the computed CSS as a `<style>` tag,
  cascading over `theme.css`'s own tokens), and a personalised logo in the
  top bar when one is set.
- 0e88f30: L22 task 1/1bis: the agent runtime is real. `AgentRegistry` used to only enable/disable a fixed, in-memory declaration array — nothing ever executed. `@cogenta/agents` gains a real execution loop wiring (`createAgentRunner`, `agents/orchestrator.ts`) together with everything the loop needed but never had a home for: persistent, editable agent declarations (`createFileAgentDeclarationStore`), a persistent, encrypted-at-rest LLM provider store (`createFileProviderConfigStore`, AES-256-GCM keyed from `COGENTA_AUTH_SIGNING_KEY`, R7), and a "skills" instruction-text library (`createFileAgentSkillStore`, `skills/library.ts` — deliberately distinct from L7's marketplace skill registry). Three built-ins are seeded on first boot: the superagent ("Cogenta Agent", enabled by default, autonomy `propose`) and two disabled examples (a dependency-scanner agent backed by the new `deps.scan` tool, and a content-watch example). Autonomy has a new three-level UI mapping (`report-only`/`co-pilot`/`autopilot`) onto contract C's frozen `AutonomyLevel` vocabulary (`autonomy/levels.ts`) — the contract itself is unchanged.
  
  `@cogenta/api`'s `agents-router.ts` gains real `create`/`update`/`remove`/`run` capabilities (all optional on `AgentRegistryLike`, backward compatible with a caller that only ever built a fixed `createAgentRegistry`); two new routers, `providers-router.ts` and `agent-skills-router.ts`. All three routers now correctly `decodeURIComponent` path segments — a pre-existing gap in `agents-router.ts` this lot's own end-to-end test caught (the seeded superagent's name, "Cogenta Agent", contains a space). New `ErrorCode`s (`@cogenta/core`): `AGENT_DUPLICATE`, `AGENT_DISABLED`, `AGENT_NO_PROVIDER` (501, mirrors `SITE_PLAN_NO_PROVIDER` — R2's "no provider configured" is not a failure), `AGENT_BUILTIN_UNDELETABLE`, `PROVIDER_NOT_CONFIGURED`, `AGENT_SKILL_UNKNOWN`/`AGENT_SKILL_DUPLICATE`/`AGENT_SKILL_BUILTIN_UNDELETABLE`, `AGENT_REGISTRY_READ_ONLY` (501), `AGENT_RUNTIME_UNAVAILABLE` (503, mirrors `ASSIST_UNAVAILABLE`).
  
  **Breaking, within pre-alpha's existing minor-only convention** (see prior changesets' own note): `createAgentDelegateTool`'s tool name is no longer the fixed `agent.delegate` — it is now `agent.delegate.<slug-of-subagent-name>`, so an orchestrator offering several named sub-agents can expose each as a distinct, nameable tool instead of one ambiguous generic call. The permission stays the single, taxonomy-fixed `agent.delegate` (`tools@1.0`); no contract change.
  
  `@cogenta/cli`'s `cogenta serve` now always constructs this runtime (three file stores under `.cogenta/agents-runtime/`) and mounts `/api/agents`, `/api/providers` and `/api/agent-skills` unconditionally — R2 still holds: without a configured provider, every route above works except `POST /api/agents/:name/run`, which refuses with `AGENT_NO_PROVIDER` before any network call (proven end to end in `packages/cli/test/serve-agents.test.ts`, including a real tool-calling loop and an R4 permission-refusal case against a local HTTP double of the Anthropic Messages API). `create-cogenta` seeds the same three built-ins at scaffold time.
  
  The admin's "Agents" screen (`packages/admin`, private, no changeset) is genuinely editable now — create/edit/run/delete a sub-agent, per-tool permission checklist, autonomy/budget/skills/sub-agents — and gains two new screens, "Providers" and "Skills".
- 750a10b: L24 task 4: the admin "Skills" screen (`AgentSkillStore`, L22 task 1bis) now stores each skill the same way L7's marketplace registry already does — `<dir>/<id>/SKILL.md` (frontmatter + body), the exact format a real Claude Code/Codex skill ships as — instead of one JSON file per record. The point is portability: a `SKILL.md` copied verbatim from `.claude/skills/` (or any other standard agent) drops straight into the store's directory and reads back correctly.
  
  `@cogenta/agents`: `parseSkillFile` (`skills/frontmatter.ts`) no longer requires a `version` field — a real Claude Code/Codex skill only ever carries `name` and `description`, and requiring a third field it doesn't have refused the exact copy-paste this task exists to support. `SkillMetadata.version` becomes optional (`file-store.ts`'s marketplace registry, which does need one to compare installed-vs-available, still writes it — this only relaxes what a skill *file* is allowed to omit). New `renderSkillFile`, the inverse of `parseSkillFile`, now exported alongside it. `AgentSkillStore`'s own contract (`list`/`get`/`create`/`update`/`remove`, and the shape of `AgentSkillInput`/`AgentSkillPatch`) is unchanged; `AgentSkill` gains a `content` field — the exact `SKILL.md` text the record renders to, always the canonical rendering of the structured fields, never a second independently-edited copy. The `enabledByDefault`/`builtin`/`createdAt`/`updatedAt` bookkeeping a portable `SKILL.md` has no room for lives in a sidecar `.meta.json` next to `SKILL.md`, deliberately kept out of the frontmatter — folding it in would leave every skill this store touches carrying Cogenta-only keys forever, defeating the point of the migration. A `SKILL.md` dropped into the store's directory with no sidecar reads fine, with sensible defaults, rather than failing.
  
  `@cogenta/api`: `/api/agent-skills`'s `POST`/`PATCH` now take `{ content: string }` (a raw `SKILL.md`) instead of separate `name`/`description`/`instructions` fields — parsed server-side with the same `parseSkillFile`, so a malformed submission fails with the same `SKILL_DEFINITION_INVALID` a file-based store would raise (newly mapped to HTTP 400 in `statusFor`). Every response now also carries `content`. **Breaking wire change** for any caller of this admin-only route (the admin app is the only one, and is updated in this same change).
  
  `@cogenta/cli`: no interface change — `agent-runtime.ts`'s use of `createFileAgentSkillStore`/`ensureBuiltinAgentSkills` is unaffected, since `AgentSkillStore`'s own contract did not change; called out here only because the on-disk format of a site's `.cogenta/agents-runtime/skills/` directory changes on next write (existing sites keep working — nothing migrates old `<id>.json` records automatically, since none exist yet on any real site this project has shipped to).
  
  `@cogenta/plugins`: `createSkillRegistry`'s marketplace submission handler (`registries/skills.ts`) now records a submission with no `version` field (a real Claude Code/Codex `SKILL.md`) as `skillVersion: null` instead of failing to compile against the now-optional `SkillMetadata.version` — no behaviour change for a submission that does carry one.
- c489fde: API keys gain the last two lifecycle actions fiche 20 left open: purge and
  recovery from a mistaken revocation (fiche 62).
  
  `ApiKeyStore` (`@cogenta/auth`) gains `purge(id)` — a real, permanent
  `DELETE` of the key row and its usage history, refused unless the key has
  been revoked for at least `MIN_PURGE_AFTER_REVOKED_DAYS` (30, newly exported)
  — and `recover(id)` — mints a replacement carrying the same name, scope and
  quota as a key revoked by mistake, without ever lifting that key's
  `revokedAt` back to `null`. Recovery only works within
  `RECOVERY_WINDOW_MS` (24h, newly exported) of the revocation; past that
  window, or for a key that was never revoked, both throw the two new error
  codes below. This is decision (b) from fiche 62's own recommendation: a
  revoked key is usually revoked for a security reason, so recovery mints a
  new credential rather than silently reactivating a possibly compromised one.
  
  `@cogenta/core` gains two error codes: `API_KEY_PURGE_INVALID` and
  `API_KEY_RECOVERY_INVALID` (both mapped to HTTP 409 — the id names something
  real, refused only because of its current state).
  
  `@cogenta/api`'s `/api/api-keys` router gains `DELETE .../purge` and
  `POST .../recover`, both admin-only, following the same request/response
  shape as the existing `rotate` route (the raw key appears exactly once, in
  the `recover` response).
  
  `cogenta serve` (`@cogenta/cli`) records `apikey.purge` and `apikey.recover`
  in the audit log, alongside the `apikey.create`/`apikey.rotate`/
  `apikey.revoke` entries that already existed — every API key lifecycle
  mutation now produces a verifiable audit entry, closing the gap fiche 20
  first flagged.
- 54ca689: API key lifecycle, rotation and a per-key request quota (fiche 20).
  
  **Breaking (`@cogenta/api`):** `POST /api/api-keys` no longer mints a key that
  never expires by default. A request that omits `expiresAt` now gets a
  90-day expiry — a real, generous but bounded default, since a key with no
  expiry is a key that leaks forever. Pass `neverExpires: true` explicitly to
  keep the old "never expires" behaviour. Any script that creates API keys
  without setting `expiresAt` will see its keys start expiring after 90 days;
  set `neverExpires: true` (or a longer `expiresAt`) if that is not wanted.
  
  New, additive:
  
  - `POST /api/api-keys/{id}/rotate` (`@cogenta/api`, `@cogenta/auth`'s
    `ApiKeyStore.rotate`): mints a replacement carrying the same name, scope
    and quota, and lets the original keep authenticating for a chosen grace
    window (1h/24h/7d) instead of dying mid-flight. The new key's raw value is
    returned exactly once, the same rule `POST /api/api-keys` already follows.
  - A per-key request quota (`rateLimitPerMinute`, `@cogenta/auth`), enforced
    once per request by `resolveActor` when a `RateLimitDriver` is supplied.
    Exceeding it answers `429` with `Retry-After` and `RateLimit-*` headers.
    `@cogenta/core` gains the `rateLimit` driver need (`createRateLimitRegistry`,
    a Redis driver and an in-process one — R1: works with no Redis at all) and
    a matching `rateLimit` configuration section; `cogenta serve`/`doctor` wire
    and report it.
  - Aggregated 7- and 30-day call counts per key (`ApiKeyStore.usage`), and a
    new admin notice when a key is within seven days of expiring
    (`createApiKeyExpiryNoticeSource`).
  - `ApiKey` gains `rateLimitPerMinute` and `supersededBy` (set once a key has
    been rotated). `ApiKeyStore` gains `getById`, `rotate` and `usage`.
  
  New error codes: `API_KEY_RATE_LIMITED` (429), `API_KEY_ROTATION_INVALID`
  (409 — a revoked or expired key cannot be rotated), `RATE_LIMIT_FAILED`.
  
  The property that a raw API key is shown exactly once, never twice, holds
  for the new rotate response too: `listApiKeys` and the `previous` half of a
  rotation response never carry key material.
- 23299e9: The assistant's vector index is now explained and manageable, not just a raw
  count (L22 task 4).
  
  - `GET /api/assistant` now reports, per content collection, whether it is
    included in the index and how many chunks it contributes
    (`vector.collections`), plus the reserved pseudo-collection name reference
    documents are stored under (`vector.referenceCollection`).
  - A new site setting, `assistant.indexedCollections` (`GET|PATCH
    /api/settings`, `admin` only), lets an operator exclude a collection —
    published articles included — from the index. The change is read live: it
    applies on the next content save, with no restart, and the existing
    "Reindex vectors" tool applies it to already-indexed content.
  - A document upload flow — `GET/POST /api/assistant/documents` and `DELETE
    /api/assistant/documents/:id` — lets an admin add reference material (PDF,
    DOCX, Markdown, plain text) to the same index the site's own content feeds,
    reusing the existing `document.extract_text` → `chunkDocument` →
    `EmbeddingProvider.embed` pipeline rather than a second one. Each document
    tracks its own `pending`/`indexed`/`error` state.
  - `@cogenta/agents` gains `createReferenceDocumentStore`,
    `ingestReferenceDocument`/`removeReferenceDocumentVectors`, and the
    `REFERENCE_DOCUMENT_COLLECTION`/`REFERENCE_DOCUMENT_LOCALE`/`REFERENCE_DOCUMENT_STATUS`
    constants a caller needs to retrieve them (e.g. via `assist.chat`'s
    `collections` input).
  - `@cogenta/core` gains one error code, `ASSIST_DOCUMENT_NOT_FOUND` (404).
  
  All of this is additive and degrades the same way the rest of L18 does: a
  site with no embeddings provider gets none of it, and every other feature
  works unchanged (R2).
- 0692713: Fiche 30 — agents and assistant admin:
  
  - `@cogenta/core`: adds a resolved `assistant.monthlyTokenLimit` config section (default one million tokens a month) and a new `ASSIST_BUDGET_EXCEEDED` error code.
  - `@cogenta/agents`: adds `createAssistUsageTracker`, a per-tool, calendar-bucketed token/call counter for the writing assistant (distinct from the existing per-agent `BudgetTracker`), wired into `createAssistToolset` and `createAssistRuntime` (`AssistRuntimeOptions.onUsage`, `AssistRequest.tool`). `AssistToolset` gains optional `model` and `usage` fields.
  - `@cogenta/api`: `GET /api/assistant` now reports `model`, `usage` (when a tracker is configured) and `vector` (driver/dimensions/count/lastIndexedAt, when a vector store exists). `POST /api/assistant/run` refuses with `ASSIST_BUDGET_EXCEEDED` (429) once the monthly cap is reached, before the provider is called. `createAssistantRouter` gains an optional `vectorInfo` option.
  - `@cogenta/cli`: `AssistantAssembly` gains `vectorInfo` (vector index visibility) and wires a usage tracker into the assistant toolset from `config.assistant.monthlyTokenLimit`. `withVectorIndexing` gains an optional `onIndexed` callback. `recordContentAudit` now records an accepted assistant suggestion's `field`/`tool` (sent by the admin as `assistApplied` on a content save) distinctly in the audit diff, alongside contract A's existing `provenance`/`provenanceDetail`.
  
  All additive — a site with no `assistant` config section gets the same default cap as before, and a site with no AI provider sees no `usage`/`model`/`vector` fields at all.
- 36744d3: Fiche 21: the audit log gains what the state-of-the-art comparison named as
  missing — a real entry detail, filters that reach a date range, an export,
  an actually-scheduled integrity check, and a way to tell a human's action
  from an agent's.
  
  **Task 1 — detail.** `GET /api/audit/{id}` (`@cogenta/api`'s `audit-router.ts`)
  answers with the entry, its resolved actor kind and label (an email, or an
  API key's name), and — for a `content.create`/`update`/`restore` action — the
  same structural diff `GET /{collection}/{id}/diff` already computes, called
  through rather than recomputed (the fiche's own warning against duplicating
  it). This needed a place to keep which content version an action produced:
  `RecordAuditInput`/`AuditEntry` gain `version`, stored in a new nullable
  `cogenta_audit_log.version` column added with a `try`/`catch` `alter table`
  (no portable `add column if not exists` across SQLite/Postgres/MySQL) — and
  **deliberately excluded from the hash `computeHash` chains together**. Adding
  a field to that canonical list would change what every already-recorded hash
  means, and every site's existing chain would fail `verify()` the moment this
  code ran. The fields that matter for accountability — who, when, what
  action, on what — are untouched; `version` is UI-convenience metadata, not
  inside the tamper-evidence boundary. A permission refusal on the diff's own
  collection (an admin who was never granted an authoring role there) degrades
  to `diffUnavailable`, not a 403 for the whole entry.
  
  **Task 2 — dates, export, pagination.** `since`/`until`/`actorKind` filters
  on `GET /api/audit`, and `GET /api/audit/export?format=csv|json` (bounded to
  10,000 entries) for the filtered view. The export is itself an audit-worthy
  event — a personal-data extraction, per the fiche — recorded as
  `audit.export` (format and count only, never the exported rows) at the same
  transport-boundary layer `cogenta serve` already records every other
  mutation at.
  
  **Task 3 — scheduled integrity, for real.** `@cogenta/auth` gains
  `AuditLog.verifyRange`/`get` (a bounded, checkpoint-resuming form of
  `verify()`) and `createAuditIntegrityStore`, which persists the last
  check's outcome across a restart. `cogenta serve` runs it once at startup
  and then on its own `setInterval` (daily by default,
  `ServeOptions.auditIntegrityTickMs` overridable for tests) — the same
  accepted trade-off as the scheduled-publication tick. Most runs are
  incremental (only entries after the last checkpoint); a full replay runs
  weekly on its own as the backstop the fiche asks for, since an incremental
  check cannot see tampering in already-checkpointed history. A break sends
  one signed channel alert (`security.audit_integrity_broken`, only on the run
  that first finds it — never once per tick) and a non-dismissible, danger-
  severity admin notice that clears itself once a forced full check reports
  the chain intact again. `GET`/`POST /api/audit/integrity` expose the status
  and the "verify now" that persists its result, alongside the untouched,
  stateless `GET /api/audit/verify`.
  
  **Task 4 — distinguishing actors.** `classifyAuditActor` (`@cogenta/auth`)
  reads signals the log already carried — `actorId === null` is `system`, the
  `apikey:` prefix `resolveActor` has minted since L13 is `api_key`, the
  `agent.tool.` prefix `withAudit` has minted since L4 is `agent`, everything
  else is `human` — no schema change needed. `withAudit` (`@cogenta/agents`)
  gains optional `model`/`autonomyLevel`, carried into the recorded diff when
  a caller tracks them. `?actorKind=` filters `GET /api/audit`.
  
  **Task 5 — retention, honestly.** No purge is wired into a schedule in this
  pass — `AuditLog.prune(olderThan)` exists, tested, and safe (it refuses to
  purge a segment that does not itself verify first, and records a genesis
  anchor so the surviving chain keeps verifying from a documented truncation
  point rather than silently going quiet about it), but nothing calls it
  automatically yet. The admin screen says so plainly: this journal keeps
  every entry and grows without limit until an operator acts.
  
  None of this is a breaking change: `AuditLog.verify()`'s signature and every
  existing route's response shape are unchanged, and the new column/tables
  are additive (a fresh `ensureAuthTables` run tolerates them being already
  there, an existing install picks them up the same way).
- 722fc6b: The site's logo, dark logo, favicon and share image now reach the rendered page
  (contract D `theme@1.3`, additive).
  
  All four were writable from the admin's Appearance screen, saved, and read back —
  and read by nothing else at all. A site that uploaded its logo still served Cogenta's
  default favicon and its own name as plain text on every page.
  
  - `@cogenta/theme-kit` gains `ChromeBrand`, the optional `ChromeInput.brand`, and
    `renderBrandMark()` — one `<picture>` with a `prefers-color-scheme` source, the
    site name always written as `alt`. A theme that ignores `brand` renders exactly as
    before; nothing about `theme@1.2` changed.
  - The five built-in themes each place the mark in their own chrome (a header bar, a
    masthead nameplate, a storefront bar), never a shared template, and each keeps the
    site name in text somewhere on the page so a failed logo never leaves it unnamed.
  - `cogenta serve` resolves the four media ids live per request, through the same
    `/_image` endpoint and the same batch media loader every other image uses. A media
    that is missing, or is not an image, falls back rather than emitting a broken tag.
  
  Two decisions worth knowing:
  
  - `shareImageMediaId` is now a **source for** `seo.defaultSocialImageUrl`, not a rival
    to it: the SEO pipeline still reads one field, and the appearance screen's picker
    wins when it is set. Neither of the two competing settings is left silently dead.
  - The favicon fallback is branding-aware. Cogenta's default icon *is* Cogenta's logo,
    so a white-labelled site falls back to its own replacement logo, and to no
    `<link rel="icon">` at all when it has none — rather than getting somebody else's
    mark back in the browser tab.
- af57fa2: L22 task 2: the inbound side of `@cogenta/channels` (L6) is wired for real. Until now, `@cogenta/channels`' identity-linking protocol, command router, and Telegram/Slack/Discord adapters were built and tested but never connected to anything — only outbound notice delivery was live.
  
  `@cogenta/channels` gains a plug-in point `createCommandRouter`'s own header comment named as explicitly out of scope for L6: `CommandRouterOptions.chat`. A message that matches no *registered* command name now falls through to this optional handler instead of `{kind: 'unrecognized'}` — same `authorizeInboundCommand` gate as a named command, evaluated against `chat.requiredRoles`. `createAgentChatBridge` builds the handler itself: it resolves an optional `"@Agent Name: message"` mention (falling back to a configured default agent, with a warning, on an unknown name), calls a structural `AgentRunnerLike.run(name, instruction, trigger?)` — deliberately the same three-argument shape `@cogenta/api`'s `agents-router.ts` already declares, not `@cogenta/agents`' raw options-object `AgentRunner['run']` — and replies with the result, truncated and flattened to fit the existing `NotificationChannelMessage` budget (`REPORT_SCREEN_BUDGET_CHARS`) rather than stretching an ill-fitting type. The one rule this whole module exists to keep: a linked channel identity is authorized against the *Cogenta account's own* roles before the runner is ever called, and defaults to requiring `admin` — the same role `POST /api/agents/:name/run` itself requires, so a channel can never grant more access than the linked account's own standing already would over HTTP (R4). Zero changes to any provider adapter (`telegram`/`slack`/`discord` `inbound.ts`) were needed — all three already call `router.route()` uniformly for every linked-identity message.
  
  `@cogenta/cli` gains a new, separate command: `cogenta channels`. Telegram long-polling is safe per replica only with exactly one dedicated process; Slack Socket Mode and Discord Gateway are each inherently a single persistent connection. None of the three ever start inside `cogenta serve` — this command is a standalone, optional, single-instance process (built the same way `cogenta mcp` is: a second independent entry point onto the same database and the same `.cogenta/agents-runtime` agent declarations, never a second copy of either) whose only job is connecting configured channels and routing authorized chat messages to a real agent run. Bot credentials are read from the environment only (`COGENTA_CHANNELS_TELEGRAM_BOT_TOKEN`, `COGENTA_CHANNELS_SLACK_BOT_TOKEN`/`COGENTA_CHANNELS_SLACK_APP_TOKEN`, `COGENTA_CHANNELS_DISCORD_BOT_TOKEN`) and never written to `cogenta.config.mjs` (R7); a provider with no token configured is simply not started (R1). `buildAgentRuntime`'s options gain an injectable `approvalQueue` (defaulting to a fresh in-memory one, unchanged behaviour for every existing caller), and `AgentRuntimeAssembly` now exposes the live instance it actually uses — every side-effecting core tool (`content.write_draft` included) is `reversible: false`, so `with-autonomy.ts`'s `forcedApproval` always routes it through this queue regardless of autonomy level; exposing it is what let this lot's own end-to-end test (`packages/cli/test/channels-chat.test.ts`) prove a chat message drives the *correct* contract-C tool through to a real approved, created entry, rather than only proving a tool was proposed.
  
  The admin (`@cogenta/admin`, private, no changeset) gains a "Canaux" screen in the IA section (any signed-in role, since linking is personal and used for notices too) — reusing the exact `/api/notices/channels/*` linking endpoints fiche 38 already exposed, no new linking mechanism — and extends the existing "MCP" screen with a "Chat API" key purpose: generates an `admin`-scoped API key (the same mechanism `/api/api-keys` already provides) and documents the `POST /api/agents/:name/run` request/response format, the same single-call-per-turn shape the admin's own new floating chat widget (bottom-right, on every authenticated screen) uses via the existing `runAgent` client function — no second streaming protocol.
  
  `@cogenta/core` gains one `ErrorCode`: `CHANNEL_PROVIDER_NOT_CONFIGURED`, thrown by `cogenta channels` when a provider's required environment variables are absent (caught internally and logged as "skipped", never surfaced as a failure — R1).
  
  Left honestly open: the approval queue `cogenta channels` (and any future admin approvals screen) would decide a pending write against has no REST surface yet — a real, pre-existing gap this lot's own test works around directly rather than papering over, not something to fix here.
- e8296a5: L25 task A0b — `selectMediaImageProcessor`, `createMediaImageProcessor`,
  `variantName`, `variantWidthsFor`, `contentTypeOf`, `VARIANT_FORMAT` and
  `MediaImageProcessorOptions` are now exported from `@cogenta/cli`'s public
  entrypoint (previously only reachable by importing `./commands/media-images.js`
  directly). `create-cogenta`'s `scaffoldSite` uses `selectMediaImageProcessor` to
  give its own real media ingestion (`seedDemoMedia`) the same image-processing
  pipeline `cogenta serve` uses for a live upload.
- 4335296: `ThemeRenderOptions` gains an optional `blocks` field (a `BlockRegistry`), threaded
  through to `theme.renderPage`/`ThemeModule.renderPage`'s new optional fourth parameter
  (fiche 43, sous-chantier C(ii)). Lets a site with blocks of its own pass its registry so
  an active theme that does not implement one of them renders its declared `fallback`
  instead of a blank slot. Absent by default — no site declares custom blocks today, so
  this is forward wiring with no behaviour change for an existing `cogenta serve`.
- 322d1a3: Fiche 52 — Cogenta Commerce: orders and customers, the trailing gap this
  audit's own opening line named ("le modèle de commande n'a aucune adresse
  postale structurée"). **Contains a breaking change**, called out below —
  contract E is deliberately not yet frozen (ADR-0024), so this ships as
  `minor` rather than `major` per this project's existing pre-alpha practice
  (see the taxonomies/trash changesets), with the break stated plainly here.
  
  **Breaking**: `POST /api/commerce/payments/{id}/refund` now requires a
  non-empty `reason` in the request body ("motif obligatoire" — task 6) and
  answers `{ refund, creditNote }` instead of the bare refund record. A caller
  sending no reason now gets `400 COMMERCE_AMOUNT_INVALID` instead of a
  refund with no stated cause.
  
  `@cogenta/commerce`:
  - `Order` gains six structured shipping-address fields
    (`shippingAddressLine1/2`, `shippingCity`, `shippingPostalCode`,
    `shippingRecipient`, `shippingPhone`) and four shipment-tracking fields
    (`trackingCarrier`, `trackingNumber`, `trackingUrl`, `shippedAt`) — all
    nullable, added in place to `cogenta_commerce_orders` on an
    already-deployed site (idempotent `alter table`, same idiom as
    `menu-tables.ts`'s `location` column; no down path exists or is needed for
    an additive nullable column).
  - `OrderStore` gains `placeManual` (a shopkeeper-entered order — phone,
    trade-show, correction — that opens a real cart and calls `place()`
    internally, never a second placement path), `update` (corrects the e-mail
    and/or address while `pending`; refuses with `COMMERCE_ORDER_LOCKED` once
    paid) and `setTracking` (attaches carrier/number/url; moving a `paid`
    order to `shipped` is a side effect of attaching tracking, not a separate
    step). `OrderListOptions` gains `placedFrom`/`placedTo`.
  - New module `order/notify.ts`: `createOrderEmailQueue`, a persisted,
    retried (`MAX_ATTEMPTS = 5`) transactional e-mail queue built on
    `@cogenta/channels`'s existing `createEmailAdapter` — never a second
    transport. A new direct dependency on `@cogenta/channels` follows (R9:
    reuse over reinvention, same package this project already depends on
    elsewhere).
  - New module `order/csv.ts`: `ordersToCsv`, an RFC 4180 accounting export,
    zero dependency (R9) — one row per order (reference, date, status, email,
    the four summed figures, invoice number when one exists). Decision this
    fiche had to make and is documenting here: row-per-order rather than
    row-per-line, matching the fiche's own singular "export comptable" wording.
  - `CustomerStore` gains `anonymize` (GDPR erasure of the customer record —
    email/name only; an order's own historical copy of the email is
    deliberately retained as a financial record).
  - New module `invoice/credit-note.ts`: `createCreditNoteStore`, one credit
    note per refund (its own `CN-2026` series, sharing the same
    compare-and-set sequence table as invoices via the newly extracted
    `invoice/sequence.ts`) — issued automatically by the refund route once
    billing is configured, never a second manual step.
  - `CommerceAdminRouter` gains routes: `POST/GET/PATCH /orders`,
    `PUT /orders/{id}/tracking`, `GET /orders/{id}/emails`,
    `GET /orders/{id}/credit-notes`, `GET /orders/export.csv`,
    `GET /payments/{id}/refunds`, `GET/POST /customers/{id}`,
    `POST /customers/{id}/export`, `POST /customers/{id}/anonymize`.
    `CommerceResponse.body` can now also be a plain `string` (the CSV export),
    alongside the existing JSON/`Uint8Array` shapes.
  - `@cogenta/core` gains four error codes: `COMMERCE_CUSTOMER_NOT_FOUND`,
    `COMMERCE_ORDER_LOCKED`, `COMMERCE_TRACKING_INVALID`,
    `COMMERCE_CREDIT_NOTE_NOT_FOUND`.
  
  `@cogenta/cli` wires all of the above into `cogenta serve`: the order-email
  queue (built whenever an e-mail transport is configured — always, in
  practice, since `runServe` builds the degraded `FileEmailTransport`
  unconditionally) and the credit-note store (built whenever `billing` is
  configured, the same gate invoicing already uses) are passed to
  `createCommerceAdminRouter`; a new scheduled task, `commerce-order-emails`
  (`COMMERCE_EMAIL_TICK_MS = 60_000`, overridable via `commerceEmailTickMs`
  for tests), flushes the retry queue — and is correctly folded into the
  scheduler's own heartbeat interval calculation, a real bug this fiche found
  and fixed (the heartbeat previously only ran as often as the *slowest* of
  the other seven tasks needed, so a fast test override on this one alone
  would never actually fire). The transport layer gains a `text/csv` branch
  alongside the existing JSON/PDF ones.
- c392e24: Redirects: 404 log, prefix patterns, editing, CSV import/export, automatic
  redirect on slug rename, and 307/308/410 status codes (fiche 12).
  
  **`@cogenta/core`**: gains a `notFoundLog` config section (`enabled`,
  `maxPaths`, `retainDays`) — on by default, bounded, purged past its
  retention. Never stores an IP address or a user agent.
  
  **`@cogenta/schema`**:
  - `RedirectStatus` widens from `301 | 302` to `301 | 302 | 307 | 308 | 410`.
    A 410 (Gone) row needs no `to`. Consumers that exhaustively switch on
    `RedirectStatus` — a rare pattern, but a real one — need a case for the
    three new values.
  - `RedirectStore` gains `update(from, { to?, status? })` — implementors of
    the interface (not typical callers) must add it. `RedirectStore.add`'s
    `to` is now optional, required only when `status` is not 410.
  - New: `createNotFoundLogStore`/`NotFoundLogStore` (the 404 log — aggregated
    by path, capped at `maxPaths` distinct paths, no personal data ever) and
    `createRedirectPatternStore`/`RedirectPatternStore` (prefix redirects —
    `/blog/*` to `/actualites/*` — matched by `startsWith`, never a regular
    expression, so the public routing path can never be exposed to
    catastrophic backtracking).
  - New: `withRedirectTracking` — wraps a `ContentStore` so renaming the slug
    of a **published** entry writes a 301 from the old path to the new one on
    its own, reversibly (renaming back makes the redirect disappear), and a
    chain of renames stays flattened to one hop.
  
  **`@cogenta/api`**: `redirect-router.ts` gains `PATCH /api/redirects` (edit
  in place), `?q=`/`?limit=`/`?offset=` on the list, `/api/redirects/patterns`
  (prefix redirects), and `/api/redirects/export` / `/api/redirects/import`
  (CSV, always previewed before anything is written — pass `apply: true` to
  commit). New `createNotFoundRouter` (`GET`/`DELETE /api/not-found`). New
  `parseCsv`/`stringifyCsv` — hand-written, zero dependency (R9).
  
  **`@cogenta/cli`**: `cogenta serve` mounts `/api/not-found` and the new
  `/api/redirects/*` routes, applies prefix-redirect resolution after the
  exact-match table finds nothing, answers a 410 with no `Location` header,
  records every public GET that matches no route into the 404 log (never for
  `/api/*`), and purges the log past its retention on a daily tick (new
  `ServeOptions.notFoundPurgeTickMs` overrides it, for tests). Renaming the
  slug of a published entry now writes its redirect automatically, wired
  through `withRedirectTracking`.
- 967ec5a: Add editorial SEO controls: the conventional `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`/`seoCanonical` override fields, a title-template option, and an admin-only door onto what `@cogenta/seo` actually computes (fiche 13).
  
  - `@cogenta/seo`'s `buildMetaTags` now reads the conventional `seoTitle`, `seoDescription`,
    `seoImage` and `seoCanonical` fields when a collection declares them — an ordinary field a
    site's own schema adds, never a contract A change. A collection that declares none of
    them behaves exactly as it did before this change. `MetadataOptions` gains
    `titleTemplate`/`collectionTitleTemplates` (`%title% — %site%`-style composition, applied
    only to a *derived* title, never to an explicit `seoTitle` override). `isIndexable` now
    also excludes an entry whose collection declares `seoNoindex` and has it switched on, via
    the new exported `isSeoNoindexed` — this is also what keeps a noindexed page out of
    `/sitemap.xml` while it still carries `noindex` in its own `<head>`.
  - `@cogenta/api` gains `createSeoRouter` (`SeoRouter`, `SeoRouterOptions`, `SeoDiagnostics`):
    `POST /api/seo/preview` computes the real head for one unsaved edit (gated by `update` on
    the named collection), and `GET /api/seo/diagnostics` is a site-wide, admin-only report —
    sitemap size and inclusion reasons per collection, `robots.txt`, and content-quality
    anomalies (missing descriptions, titles over 60 characters, duplicate titles, and the
    "published but the sitemap would be empty" class of bug this fiche is named for). Both
    routes call the exact same `buildMetaTags`/`isIndexable`/`isPublished` the public render
    path calls — neither one re-derives anything. `@cogenta/api` gains a new dependency on
    `@cogenta/seo`.
  - `@cogenta/cli` mounts `/api/seo` in `cogenta serve`, next to `/api/redirects` and
    `/api/search`.
  
  All additions are additive and backward compatible: a collection that declares none of the
  conventional SEO fields, and a caller that never sends `titleTemplate`, see no behaviour
  change.
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
- edf5623: Fiche 15 — comments (ADR-0025, new contract F, `comments@1.0`):
  
  - **New package `@cogenta/comments`**: the comment model and store
    (`CommentStore`) — plain-text body only (R3: no HTML tags accepted, ever),
    hashed IP (never stored in clear, RGPD), moderation status
    (`pending`/`approved`/`spam`/`trash`), threading via `parentId`,
    `provenance`. A reversible migration (`ensureCommentsTables`/
    `dropCommentsTables`), tested up/down/up on SQLite; Postgres/MySQL/MariaDB
    integration tests are written (`test/integration/tables.test.ts`) but not
    executed this session (no local Docker). `createCommentsRouter` is the
    CMS's first public write route (`POST /api/comments`, no actor required)
    plus the admin moderation queue, both behind contract F's own permission
    vocabulary (`comments.read`/`moderate`/`reply`/`purge`/`settings`, distinct
    from contract A's five frozen actions). The public route enforces, from
    day one: rate limiting by IP and by target (`createCommentRateLimiter`),
    a honeypot field, a minimum fill-delay, non-AI spam heuristics
    (`checkSpamHeuristics`), and the WordPress "auto-approve a returning
    commenter" rule. A no-JS `<form method=post>` gets a `303` redirect back to
    its own page (`redirectTo`, validated against open-redirect and HTTP
    response-splitting) instead of a raw JSON body.
  - **`@cogenta/core`**: ten new error codes (`COMMENT_NOT_FOUND`,
    `COMMENT_BODY_INVALID`, `COMMENT_AUTHOR_INVALID`, `COMMENT_TARGET_INVALID`,
    `COMMENT_TARGET_CLOSED`, `COMMENT_PARENT_INVALID`,
    `COMMENT_PARENT_TOO_DEEP`, `COMMENT_STATUS_INVALID`,
    `COMMENT_RATE_LIMITED`, `COMMENT_SPAM_DETECTED`).
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY` gains the `discussion`
    group (`discussion.enabled`/`moderationRequired`/`allowAnonymous`/
    `autoCloseDays`/`maxNestingDepth`/`notifyEmail`) — the site-wide defaults
    a collection or an entry can still override from `@cogenta/comments`'s own
    settings store (per-collection/per-entry overrides deliberately do not
    live in this registry, which is site/locale scoped only).
  - **`@cogenta/api`**: `shell-status-router.ts` gains `commentsPending` (a
    structural `CommentsQueueLike`, the same pattern `commerceOrdersPending`
    already uses) — additive, existing callers that never pass `comments` see
    `null` exactly as before.
  - **`@cogenta/theme-canonical`**: `renderCommentsSection` — the comment
    thread and its plain-HTML submission form, built through the existing
    `h()`/`text()` tree (no `raw()` escape hatch exists in this package, which
    is what makes "no visitor HTML ever reaches the page" structural rather
    than a habit to remember). Rendered by `renderEntryPage`
    (`@cogenta/cli`'s `theme-render.ts`) after the page's own `<main>`, on both
    the published page and the L16 page-builder preview's own draft render —
    except the preview, which never shows it (its `_ts` anti-spam field cannot
    be identical across two separate renders, so byte-identity there would be
    comparing two different legitimate values; `serve-builder.test.ts`'s
    fidelity test now documents this as a deliberate, checked difference).
    Contract B is untouched — no `comments` block, same reasoning L10 gave for
    `/search`.
  - **`@cogenta/import`**: `importWordPress` gains an optional `comments`
    option (a `CommentStore`) — when given, every importable WordPress comment
    is written with its real status (`wp:comment_approved` mapped to
    pending/approved/spam/trash, not just `'1'`), real threading
    (`wp:comment_parent`), on **both** posts and pages. Pages never imported a
    single comment before this — a real, independent bug, not something this
    fiche introduced, found while checking what the importer does today per
    the fiche's own instruction. Inline HTML a legacy WordPress comment form
    allowed (`<a>`, `<em>`, …) is stripped to plain text and reported (R3: no
    escape hatch). Absent `comments` keeps the pre-fiche-15 behaviour
    unchanged (approved-only, posts-only, the synthetic `comment` collection)
    for a caller that has not wired `@cogenta/comments` yet — its `post` field
    is a hard `relation` to the `post` collection specifically, so extending
    it to pages was never an option, only the real store is.
  - **`@cogenta/cli`**: `cogenta serve` mounts `/api/comments` (public POST +
    moderation queue), extends `readBody` to also parse
    `application/x-www-form-urlencoded` (the no-JS form's own content type —
    every other route still only ever sends JSON), wires the comment thread
    into `theme-render.ts`'s page render, and passes a real `CommentStore`
    into every `importWordPress` call site (the terminal command and the
    admin's import screen alike). `cogenta doctor`/`serve` create contract F's
    tables idempotently, the same way commerce's tables are created — a site
    that never receives a comment never pays for them.
  
  Admin (`@cogenta/admin`, private, no changeset): a moderation queue screen
  (`/comments`, counters, bulk actions, search, reply-from-the-admin), a
  pending-count nav badge, `assist.moderate` reused verbatim as an indicator
  (never an action — its own closed `none`/`review` union already guarantees
  that, per the fiche's own instruction not to build a second decision path),
  a "Discussion" settings tab (previously a placeholder), and a per-entry
  comments toggle in the entry editor sidebar.
- db307e0: Add form definitions and submissions — contract G (`forms@1.0`, ADR-0026, fiche 16). A site can now build a form in the admin and receive real submissions, without JavaScript and without an AI provider.
  
  - New package **`@cogenta/forms`**: `FormDefinition`/`FormSubmission` model (nine field kinds — text, longText, email, phone, number, date, choiceSingle, choiceMulti, consent; no `file` field in this first version, a deliberate scope cut), `createFormStore` (definitions CRUD, `submit`/`list`/`markStatus`/`bulkMarkStatus`/`searchByEmail`/`deleteByEmail`/`purgeExpired`), full server-side `validateSubmission` (independent of any client-side check, for every field kind), anti-abuse primitives (`checkHoneypot`, `checkFillDelay`, `checkSubmitRateLimit`), and `notifyNewSubmission`/`sendAutoresponder` — both built on `@cogenta/channels`'s existing email adapter, never a second transport. `ensureFormsTables` follows the same `create table if not exists` shape as `@cogenta/commerce`'s tables — a site that never builds a form still creates them, since (unlike commerce) forms tables are cheap enough not to gate.
  - `@cogenta/core` gains eleven `FORM_*` error codes.
  - `@cogenta/api` gains `createFormsRouter` (`/api/forms/*`): admin-only CRUD on definitions and submissions (bulk mark/delete, unread count, CSV-ready listing, GDPR search/erase by e-mail), plus the CMS's **second public write route**, `POST /api/forms/{name}/submit` — no actor check, its own defences (honeypot, minimum fill delay, per-IP rate limit, full server-side validation) stand in for one. The client's IP is read from the resolved request context, never from a client-supplied `X-Forwarded-For` header — trusting that header would let an attacker rotate it per request and step around the rate limiter entirely. `ShellStatus` gains `formSubmissionsUnread` for the admin's nav badge (additive).
  - `@cogenta/cli` wires it all into `cogenta serve`: `GET /forms/{name}` is the public, no-JavaScript "route dédiée" ADR-0026 chose over a contract B block (a bloc `form` RFC is left open in parallel); a plain HTML form post is answered with a real redirect on success or an accessible re-display of the visitor's own values and per-field error (`aria-invalid`/`aria-describedby`) on failure; notifications reuse the same `FileEmailTransport` already built for account invitations; submissions past a form's own `retainDays` are purged automatically on a daily tick, the same `retainDays`/`purgeExpired` model ADR-0022 established for the trash.
  - Admin (`@cogenta/admin`, private, no changeset): `routes/forms.tsx` (the builder, reusing fiche 03's `RepeaterField` for the field list rather than a second repeater) and `routes/form-submissions.tsx` (list/filter/detail/bulk actions/CSV export via `lib/csv.ts`/GDPR search & erase by e-mail), with an unread-count nav badge.
- 49815b9: Account lifecycle: invitation by email, search/pagination/bulk actions, a
  self-service public profile, dormant/MFA-recommended signals, and
  irreversible anonymization (fiche 17).
  
  **Breaking (`@cogenta/auth`), in the same pre-1.0 sense the taxonomies/trash
  and redirects changesets already used this bump for**: `User['status']`
  widens from `'active' | 'disabled'` to also include `'invited'` and
  `'anonymized'` — an exhaustive `switch` on the old two-value union needs a
  new case. `User` also gains four new non-optional fields (`displayName`,
  `avatarMediaId`, `bio`, `locale`, all `string | null`) — code that builds a
  `User` object literal by hand (rather than reading one back from
  `UserStore`) needs to add them. `CreateUserInput` gains an optional `status`
  (defaults to `active`, so existing callers are unaffected).
  
  **`@cogenta/auth`**:
  - `UserStore` gains `updateProfile` (self-service, fiche 17 task 3),
    `delete` (real hard delete — safe only for a never-accepted `invited`
    account, see its doc comment for why that does not contradict "accounts
    are disabled, never removed"), and `anonymize` (RGPD-erasure: replaces the
    email with a non-reversible `@anonymized.invalid` token, clears the
    profile fields, sets `status: 'anonymized'`).
  - `SessionStore` gains `lastSeenByUser()` — the last activity timestamp for
    every account in one query, across every session ever held (revoked and
    expired included), for the "last sign-in" column and the dormant-account
    signal.
  - `PasswordResetStore` gains `pending(userId)` — the still-usable token for
    a user, if any, without ever returning the token itself. Used by fiche
    17's invitation to answer "invitation sent on …" and to support resend.
  - New table columns on `cogenta_users` (`display_name`, `avatar_media_id`,
    `bio`, `locale`), added the same additive, catch-and-ignore way the API
    key lifecycle columns were.
  - New error codes: `AUTH_INVITE_UNAVAILABLE` (503), `AUTH_INVITE_INVALID_STATE`
    (409), `AUTH_ACCOUNT_ANONYMIZED` (409), `AUTH_ANONYMIZE_CONFIRMATION_MISMATCH`
    (400).
  
  **`@cogenta/api`**: `users-router.ts` grows substantially, entirely additive
  at the route level —
  - `POST /api/users` accepts `invite: true`. With `onInvite` wired, it
    creates an `invited` account and hands the invitation token to the
    callback instead of returning a password — the same single-use token
    primitive `/forgot-password` already uses, reused rather than
    reimplemented. Without `onInvite` wired (or the flag omitted), the route
    behaves exactly as it always has: a generated password, shown once (R1's
    mandatory fallback). The response gains `invited`/`emailSent` alongside
    the (now optional) `password`.
  - `GET /api/users` gains `?sort=`, `?after=`, `?limit=`, and a substring
    match on display name as well as email for `?q=`. The response gains
    `page: { hasMore, nextCursor }` and `meta: { invitationEmailAvailable }`
    — `data` is unchanged.
  - `POST /api/users/{id}/invite` (resend) and `DELETE .../invite` (cancel —
    a real delete, safe for the reason above) are new.
  - `POST /api/users/bulk` (`disable`/`enable`/`setRoles` over several ids at
    once, `Promise.allSettled`, a report naming every failure) is new.
  - `PATCH /api/users/me/profile` (self-only, mirrors the existing
    self-only `/me/password`) is new.
  - `POST /api/users/{id}/anonymize` (admin-only, confirmed by typing the
    account's current email, refuses the last active admin the same way
    disabling one already did, writes one `user.anonymize` audit entry that
    never carries the erased address) is new.
  - `auth-router.ts`'s `POST /api/auth/reset-password` gains one line: an
    `invited` account is flipped to `active` the moment its token is
    redeemed — the only place in the product that changes that bit, and the
    reason the invitation never needed a second token type.
  - `statusFor()` gains the four new codes above.
  
  **`@cogenta/cli`**: `cogenta serve` wires the users router's `collections`
  (for the MFA-recommended signal) and a new `onInvite` callback, delivered
  through a new `invite-mail.ts` (the file-transport email, sibling to the
  existing `reset-mail.ts`) pointed at the same `/admin/reset-password` screen
  `onForgotPassword` already uses — accepting an invitation and resetting a
  forgotten password redeem the identical token type.
  
  Tests: `@cogenta/auth` 189 (19 new), `@cogenta/api` 582 (78 new across
  `users-router.test.ts` and `auth-router.test.ts`), `@cogenta/cli` 236 (11
  new in `test/serve-users.test.ts`, end to end over real HTTP against a real
  mail directory — invite, read the mail, redeem, sign in; single-use and
  expiry; resend/cancel; bulk actions; self-service profile; anonymization
  with audit-log coherence). `@cogenta/admin` (private, no changeset) gains
  26 new UI tests across `test/users/users.test.tsx` and
  `test/users/profile.test.tsx`.
- 122da7a: Fiche 18 (profile and authentication): TOTP recovery codes, readable sessions
  with bulk sign-out, an account's own activity feed, and a fetchable password
  policy.
  
  **`@cogenta/core`** gains two error codes: `AUTH_RECOVERY_CODE_INVALID` and
  `AUTH_RECOVERY_CODES_UNAVAILABLE`.
  
  **`@cogenta/auth`** (the priority of this fiche): confirming TOTP enrolment
  now mints ten single-use recovery codes in the same step and hands them back
  — `confirmTotpEnrolment` returns `Promise<RecoveryCodesIssued>` instead of
  `Promise<void>`. New `AuthService` methods: `recoveryCodeLogin`,
  `regenerateRecoveryCodes`, `recoveryCodesStatus`. `passwordLogin`, `totpLogin`
  and `completeWebAuthnLogin` accept an optional `LoginContext` (`userAgent`,
  `ttlMs`) for "remember me" and readable sessions. `SessionStore` gains
  `revokeAllExcept` ("sign out everywhere else") and every session now reports
  a `browser`/`device` pair distilled from the `User-Agent` at creation —
  never the raw header, never an IP address. `CredentialStore` gains
  `setRecoveryCodes`/`recoveryCodesStatus`/`consumeRecoveryCode`/`removeRecoveryCodes`.
  New exports: `generateRecoveryCodes`, `hashRecoveryCode`, `verifyRecoveryCode`,
  `normaliseRecoveryCode`, `RECOVERY_CODE_COUNT`, `parseUserAgent`,
  `ParsedUserAgent`, `LoginContext`, `RecoveryCodesIssued`. Consumption is a
  real compare-and-set on the stored batch (the same idiom `resets.ts` already
  used for password-reset tokens), with a bounded retry against the fresher row
  on a lost race — proven under genuine two-connection SQLite concurrency, code
  by code, in `packages/auth/test/recovery-code-concurrency.test.ts`, alongside
  a naive-control test showing the read-then-write shape it replaces really
  would let one code work twice.
  
  **Breaking, honestly**: `confirmTotpEnrolment`'s return type change and the
  new required members on `SessionStore`/`CredentialStore` are real breaks for
  anyone who type-pinned the old signatures or hand-rolled an implementation of
  either store interface — real callers of `createAuthStore`/`createAuthService`
  (the only supported way to get one) are unaffected. Marked `minor` rather than
  `major` per this project's existing 0.x convention (no package has used
  `major` yet, and one now would jump straight to `1.0.0`, which contradicts
  "pre-alpha") — human judgement invited to confirm.
  
  **`@cogenta/api`**: new routes `POST /api/auth/recovery-code`,
  `GET /api/auth/password-policy`, `GET /api/auth/totp/recovery-codes`,
  `POST /api/auth/totp/recovery-codes/regenerate`, `POST
  /api/users/me/sessions/revoke-others`, and `GET /api/audit/me` (the one audit
  route open to a non-admin — force-scoped server-side to the caller, never a
  client-supplied id). `POST /api/auth/totp/enrol/confirm`'s response gains
  `recoveryCodes`; `GET /api/users/{id}/sessions` entries gain `browser`,
  `device` and `isCurrent`. New export: `createRecoveryCodeUsedNoticeSource`
  (the security notice a recovery-code sign-in triggers).
  
  **`@cogenta/cli`**: `cogenta serve` wires all of the above — the new notice
  source is registered, and a recovery-code sign-in is recorded in the audit
  log as `auth.recovery_code_used` instead of the generic `auth.login`.
- 2fb2101: Add the editorial site settings screen (fiche 23, ADR-0025's third settings
  category between `cogenta.config.mjs` — infrastructure, read-only — and
  `localStorage` — personal preference).
  
  - `@cogenta/schema` gains a typed key/value site-settings store
    (`createSiteSettingsStore`) backed by a closed registry: general (title,
    tagline, admin email, time zone, date/time style), reading (home path,
    posts per page), media (max upload size), and privacy (policy path, cookie
    banner). Every setting has a declared scope (site or per-locale), a default,
    and a required permission; writing an undeclared key is refused.
  - `@cogenta/api` gains `createSitePlanRouter`'s sibling `GET|PATCH
    /api/settings` and extends `GET /api/config-status` with `storage`,
    `llm`/`embeddings`/`imageGeneration`/`vector`, and `billingConfigured` —
    never a secret, never a credential.
  - `@cogenta/cli` wires the new store into `cogenta serve`/`dev`, and
    `theme-render.ts` now serves the configured home path instead of always
    falling back to the hardcoded `/home`.
  - `@cogenta/core` adds `SITE_SETTING_UNKNOWN`/`SITE_SETTING_INVALID` and a
    `secret-hygiene` module the settings screen uses to detect a
    `database.url` with embedded credentials, or a `.env` file readable by
    other users on shared hosting.
  - `create-cogenta` now writes the generated `.env` (which holds
    `COGENTA_AUTH_SIGNING_KEY`) with mode `0o600` instead of the default —
    closing the shared-hosting exposure `docs/hebergement-mutualise.md`
    already named as a known gap.
  
  The admin's old single-control "Paramètres" screen (the signed-in account's
  own interface language) moves to "My profile"; `/settings` is now the
  site-wide editorial screen.
- 0e90b32: Add the "Santé" and "Outils" admin screens (fiche 24), maintenance mode, and a bounded server error journal.
  
  - `@cogenta/core`: adds `createErrorLog`, a bounded, redacted ring buffer for the last N server errors — the admin's substitute for reading `stdout` on a host with no access to the process.
  - `@cogenta/schema`: adds `createMaintenanceStore`/`ensureMaintenanceTable` (a one-row on/off switch with a visitor-facing message) and exports `reindexAll`/`reindexEntry` from the search indexer, so a full rebuild reuses exactly what the write path already does on save.
  - `@cogenta/api`: adds `createHealthRouter` (`GET /api/health-report` — literally `cogenta doctor`'s own report, over HTTP; migrations status/apply; audit chain integrity; disk usage; the error log; maintenance mode get/set) and `createToolsRouter` (`GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs[/…]` — seven maintenance tools, always queued, never run inline in the request). Adds a `pending-migrations` notice source.
  - `@cogenta/cli`: `cogenta serve` wires all of the above — `runDoctor` reused unchanged, migrations applied only up to the first destructive one (the CLI is named for the rest), the seven tools (purge caches, reindex search/vectors, regenerate image variants, check links, test email, purge expired trash) running through the existing database-queue driver's degraded tier, and a maintenance-mode gate that serves an uncacheable 503 with a wait page to every anonymous visitor while `/api/*` and `/admin*` stay reachable.
  
  Purely additive: `createRequestListener`'s new third parameter is optional, and every `AssembleSiteOptions` addition is optional — a caller that builds a `Site` by hand, or does not pass a migrator, keeps working unchanged.
- d0bfa1d: Add `@cogenta/export`: content export/import (`export@1.0`, NDJSON, permission-aware),
  media archive export (streaming ZIP, references or full bytes), full-site backup and
  restore (`cogenta-backup@1.0`, engine-independent, checksummed, optionally encrypted
  with a passphrase), and GDPR/RGPD personal-data export by email — fiche 26.
  
  `@cogenta/core` gains nine error codes (`EXPORT_*`, `BACKUP_*`, `RESTORE_*`) and exports
  `MEDIA_TABLE`, its media table's physical name, so a caller assembling a full-site
  backup can name every table without depending on `@cogenta/core`'s internals.
  
  `@cogenta/cli` gains four new commands: `cogenta export`, `cogenta import content`,
  `cogenta backup create|list`, and `cogenta restore preview|apply`. Restoring a full
  backup is **CLI-only, by design** — it overwrites the database an admin session would
  be running against, so it is never exposed over HTTP; an admin instead applies a
  *content* export (additive, reversible through the trash).
- 95acedf: Analytics drill-down (fiche 27): pages, referrers, period comparison, custom
  date range, entry-editor stats, CSV export, and configurable, automatically
  purged retention — the gaps found against Jetpack Stats/Plausible/Matomo. No
  new field is collected: every addition is computed from the events row this
  package already wrote (path, referrer domain, device, daily-salted session
  hash), so the site's cookie-free, no-consent-banner posture is unchanged.
  
  **`@cogenta/analytics`**: `AnalyticsStore.getSummary` now returns
  `previousTotalViews`/`previousUniqueVisitors`/`viewsChangePercent` — the
  equal-length window immediately before the requested one, with `null` (never
  a misleading `0`) when there is no previous traffic to compare against.
  `getPageStats(path, window)` reports one page's views, previous-period views
  and rank among every path seen in the window — what an entry-editor sidebar
  needs, without pulling the whole top-N list. `purgeEvents(retainDays)` and
  `purgeSalts(retainDays)` delete rows past a configured retention; the events
  table is the largest table on a site with real traffic, and there is no way
  to disable purging outright, only to choose how long to keep.
  
  **`@cogenta/core`**: new config section `analytics.retainDays` (default 400
  days), resolved alongside every other site setting.
  
  **`@cogenta/api`**: `createAnalyticsRouter`'s `GET /api/analytics/summary`
  accepts a custom `?since=&until=` range (alongside the existing `?days=`),
  reports the period-over-period comparison, and — when the caller wires in
  `resolvePage` — enriches each top page with its entry's title and admin edit
  link. A new `GET /api/analytics/page?path=` answers the same admin-only stats
  for one page. `retainDays`, when wired in, is echoed back as `retentionDays`
  so the admin screen can show a real number instead of a promise.
  
  **`@cogenta/cli`**: `cogenta serve` wires the new `analytics.retainDays`
  config into a daily purge tick (same shape as the existing scheduled-publish
  tick — a sweep right away, then one every 24h) and resolves top pages against
  the site's real routes and permission-checked content gateway, so the summary
  screen can link straight to the entry in the admin.
  
  Purely additive: a site that never reads `/api/analytics/summary` behaves
  exactly as before.
- bebbab8: Add store settings for the shop (fiche 34): tax zones/rates with a simulator, shipping
  zones/methods with a simulator, payment driver activation (presence-only for keys, never
  values), general store settings, and a configurable invoice template.
  
  - `@cogenta/core` gains a `payment` configuration section (`driver`, `testMode`,
    `manualInstructions`) following the exact `llm`/`billing` pattern: the Stripe secret key
    and webhook secret are never declared in the schema and are refused with
    `CONFIG_SECRET_IN_FILE` if written to `cogenta.config.mjs` — they come only from
    `COGENTA_PAYMENT_STRIPE_SECRET_KEY`/`COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET`.
  - `@cogenta/schema`'s site-settings registry (fiche 23) gains a `commerce` group
    (currency, tax-inclusive/exclusive display, countries served, minimum order, default
    backorder policy, ToS/return-policy page paths — pointers to real content entries, not
    text fields — and invoice series prefix/payment terms/language) and a new `select`
    `uiType` for closed-choice settings.
  - `@cogenta/commerce`'s admin router gains `GET|POST /tax/rules`, `DELETE
    /tax/rules/{id}`, `POST /tax/simulate` (calls the real resolver, never a second
    implementation), the shipping equivalents (`/shipping/methods`, `/shipping/simulate`),
    and `GET /payment/drivers` / `POST /payment/drivers/{name}/test-connection` (presence
    and live health only, never a key's value). `CommerceAdminRouterOptions` gains required
    `tax`/`shipping` fields and an optional `payment` field — **a breaking change** for any
    direct caller of `createCommerceAdminRouter` that does not yet pass them.
  - `@cogenta/cli`'s `cogenta serve` now selects a real payment gateway through
    `createPaymentRegistry` (Stripe when a key is configured and reachable, bank transfer
    otherwise) instead of a hardcoded manual gateway, and mounts the new commerce settings
    routes.
  - `@cogenta/admin` (private, no changeset) gains four screens under "Boutique": Tax,
    Shipping, Payment, and Store settings (general + invoice template), all `admin`-only.
  
  Deliberately not built in this fiche: an inbound `POST /api/commerce/payments/webhook`
  route. `PaymentStore.handleWebhook` is already implemented and tested; wiring it needs
  the raw (non-JSON-parsed) request body, which `cogenta serve`'s shared body reader does
  not yet support for any route. The payment screen shows the webhook URL a deployer would
  configure at Stripe, honestly labelled as not yet receiving events. See `BLOCKERS.md` §15.
- a8199ea: Media library folders, and the fiche 11 search/filter/sort/pagination/tags/usage/replace
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
- 16f63f6: Bring form definitions and submissions closer to parity with premium form plugins (Gravity Forms/WPForms) — fiche 47, tasks 1-4 and 6-11 (task 5, a contract B `form` block, stays out of scope pending its own RFC).
  
  - **`@cogenta/forms`**: the field vocabulary gains a tenth kind, **`file`** — a deliberate reopening of ADR-0026's own renoncement, decided live with the user (fiche 47 §8). A `file` field's bytes are sniffed against a closed category vocabulary (`image`/`pdf`/`document`/`text`, via `sniffFormFileCategory`/`assertAllowedFormFile`) — never trusted from a filename or declared `Content-Type` — with a hard, unconfigurable size ceiling (`FORM_FILE_HARD_MAX_BYTES`) on top of any per-field `maxSizeBytes`. `FormFieldDefinition` gains `showIf` (task 1: a field masked by an unmet condition is neither required nor validated, evaluated server-side against the raw submission — `evaluateCondition`/`isFieldVisible`) and `acceptCategories`. `FormDefinition` gains `steps` (task 2: real multi-step forms, validated so every field belongs to exactly one step), `notifyChannels` (task 4: extra Slack/Discord/Telegram/webhook targets via `@cogenta/channels`'s existing `ChannelRegistry`/adapters, never a new transport — `notifyChannels()`) and `captcha` (task 10: optional, off by default, Cloudflare Turnstile verification via `verifyCaptcha`, a single HTTP call, no client SDK dependency). `FormDefinitionStore` gains `duplicate` (task 11: an independent, inactive copy, never carrying submissions over). `FormSubmissionStore` gains `addNote`/`listNotes` (task 8: operator-only notes, never exported) and `list()` gains `query`/`from`/`to` (task 7: full-text search across a submission's own values plus a date range, SQL-filtered then bounded in-memory for the text match — the same honest tradeoff `searchByEmail` already makes). New `csv.ts` (`csvField`/`toCsvRow`/`csvHeaderRow`/`csvSubmissionRow`) mirrors `packages/admin/src/lib/csv.ts`'s CWE-1236 formula-injection guard for the new server-side streamed export (task 9).
  - **`@cogenta/core`**: four new `FORM_*` error codes (`FORM_FILE_REJECTED`, `FORM_CAPTCHA_REQUIRED`, `FORM_CAPTCHA_FAILED`, `FORM_STEP_INVALID`), each mapped to a 4xx status in `@cogenta/api`'s `STATUS_BY_CODE`.
  - **`@cogenta/api`**: `createFormsRouter` gains `storage` (a `StorageDriver`, for the `file` field — absent means every upload is refused rather than silently accepted) and `channelRegistry` options; `POST /api/forms/{name}/submit` now accepts `multipart/form-data` (sniffing and storing any uploaded file before validation), understands multi-step submissions (`_step`/`_accumulated`, answering `202 {status:'step', nextStep, values}` for every step but the last, exactly as before for a single-page form), verifies the CAPTCHA on the final step when a form has one enabled, and dispatches `notifyChannels` alongside the existing e-mail notification. New routes: `POST /api/forms/{id}/duplicate`, `GET`/`POST /api/forms/submissions/{id}/notes`, and `?q=`/`?from=`/`?to=` on `GET /api/forms/submissions`. New export `streamSubmissionsCsv` — an async generator, never buffering the whole export in memory (a single-form export uses that form's own field names as fixed CSV columns; a cross-form export pays one bounded pre-pass to discover columns before streaming rows for real).
  - **`@cogenta/cli`**: `readBody` (`serve.ts`) now parses a real `multipart/form-data` body (reusing `@cogenta/api`'s existing zero-dependency parser) as raw bytes rather than corrupting it through a UTF-8 text decode — this is what makes a `<form enctype="multipart/form-data">` post work with no JavaScript at all, for `/api/forms/*` and (latent, previously dead in production) `/api/media` alike. `forms-page.ts` renders a `file` input, one step at a time for a multi-step form (each step a plain chained `<form method="post">`, no client framework — the original page-load timestamp is carried forward unchanged rather than refreshed, so the anti-abuse fill-delay check keeps its meaning across the whole flow), and the Turnstile widget only on the final step of a form that opted into the CAPTCHA. New route `GET /api/forms/submissions/export.csv` (admin-only, streamed directly to the response, outside `RestResponse`'s JSON-only shape — same reasoning as `/api/media/{id}/file`).
  - Admin (`@cogenta/admin`, private, no changeset): `routes/forms.tsx` gains per-field `showIf`/step/file-category editing (plain text columns on the existing field repeater, not a second visual builder), `notifyChannels`/CAPTCHA configuration, and a Duplicate action; `routes/form-submissions.tsx` gains a search box, a date range filter, internal notes, the referrer (stored since fiche 16 but never shown before), and a server-streamed CSV download (`downloadSubmissionsCsv`) replacing the old 200-row-capped client-side export.
  
  A form with none of these features enabled behaves exactly as it did before this change — `steps`/`notifyChannels` default to empty and `captcha` defaults to disabled, and no field's `showIf` means no field's requiredness changed. The form stays fully functional with no JavaScript at every task except the CAPTCHA widget itself, which is opt-in and inherently third-party script.
- a15b1ae: Theme manifest gains `description`/`author` (`theme@1.2`, additive), and the
  "Apparence" admin screen splits into a theme gallery and a "Personnaliser"
  screen reached from it (fiche 48).
  
  - `@cogenta/render`'s `ThemeManifest` gains optional `description?: string`
    and `author?: string` (`theme@1.2`). Both are optional so a manifest
    written before this version, or a third-party theme that simply omits
    them, keeps validating unchanged — the appearance gallery falls back to
    the registry's own `label` when `description` is absent, and shows no
    author line at all when `author` is absent.
  - The five built-in themes (`@cogenta/theme-canonical`, `-ecommerce`,
    `-entreprise`, `-magazine`, `-portfolio`) now declare `description` and
    `author: 'Cogenta'` in `theme.config.ts`. Patch releases: no rendering
    behaviour changed, only manifest metadata.
  - `@cogenta/api`'s `AvailableThemeLike` (and `GET /api/theme`'s
    `availableThemes`) gains `version: string` and `author: string | null`,
    read straight from each theme's manifest rather than duplicated by hand —
    editing a theme's `theme.config.ts` alone now changes what the API
    returns.
  - `@cogenta/cli`'s `theme-registry.ts` `availableThemes()` becomes
    **async** (breaking for any direct caller — it now has to load and cache
    each theme's manifest, which is an ESM dynamic import): it reads
    `label` from the registry as before, but now reads `description`,
    `version` and `author` from the theme's own manifest instead of a
    hand-duplicated string. Both call sites in `cogenta serve` were updated
    to `await` it.
  - The admin's "Apparence" screen (`packages/admin`, unpublished) is split
    into two screens: a gallery (theme preview, name, description, version,
    author, and a "Personnaliser" action on whichever theme is active) and a
    personalization screen (tokens, contrast warnings, additional CSS,
    identity, skin gallery, AI generation) — previously one dense, continuous
    screen. Purely a navigation change: every existing action still does
    exactly what it did before, just behind one more click.
- 656163e: LLM provider catalog (fiche 56): OpenRouter, DeepSeek, Qwen and GLM are now
  configurable from the admin's "Providers" screen alongside Anthropic, OpenAI
  and Google, plus an explicit "custom provider" option for any other
  OpenAI-compatible endpoint (a self-hosted proxy, or a vendor not yet
  catalogued). No new network code: every OpenAI-compatible entry (OpenRouter,
  DeepSeek, Qwen, GLM, custom) reuses `createOpenAiClient` unmodified, only
  pointed at a different `baseUrl`.
  
  **`@cogenta/agents`**: `provider` widens from the closed 3-literal union
  (`'anthropic' | 'openai' | 'google'`) to a plain string, validated at the
  write boundary instead of by a type — `@cogenta/core`'s own
  `llmSchema.provider` was already a free string before this fiche. New
  `providers/catalog.ts`: `KNOWN_PROVIDER_CATALOG` (id/label/wireFormat/
  defaultBaseUrl/knownModels per vendor) and `findProviderCatalogEntry`.
  `createProviderRegistry` resolves a name via the catalog when it knows one
  (dispatching to the right adapter by `wireFormat`), and otherwise requires
  the entry's own `baseUrl` — that pairing (no catalog entry + a `baseUrl`) is
  what "custom provider" means structurally, with no separate flag to keep in
  sync. `createOpenAiClient` gains an optional `name` (defaults to `'openai'`)
  so a client built for OpenRouter/DeepSeek/Qwen/GLM/a custom endpoint reports
  its own id via `ProviderClient.name` — needed for the privacy allowlist
  (`assertProviderAllowed`) to recognise the right vendor rather than every
  OpenAI-compatible client misreporting itself as literally `'openai'`.
  `createFileProviderConfigStore.upsert`/`updateSettings` reject a malformed
  provider id (`PROVIDER_ID_INVALID`) or one outside the catalog with no
  resolvable `baseUrl` (`PROVIDER_CUSTOM_BASE_URL_REQUIRED`) — the write-time
  checks that make network-time resolution failures unreachable.
  
  **Breaking (`@cogenta/agents`):** `PROVIDER_NAMES` (the fixed 3-name array)
  is removed — read `KNOWN_PROVIDER_CATALOG` instead, or accept that
  `ProviderName` is now `string`. `ProviderRegistryConfig`'s value shape gains
  nothing new but is now keyed by an open string rather than the closed union.
  
  **`@cogenta/core`**: two new error codes, `PROVIDER_ID_INVALID` and
  `PROVIDER_CUSTOM_BASE_URL_REQUIRED` (both 400).
  
  **Breaking (`@cogenta/api`):** `providers-router.ts`'s `ProviderRegistryLike`
  gains a required `catalog: readonly ProviderCatalogEntrySummary[]` — any
  caller implementing this interface directly (rather than using
  `@cogenta/cli`'s adapter) must supply it. New route `GET
  /api/providers/catalog` (admin-only) serves it; `catalog` is a reserved
  provider id as a result (a provider literally named "catalog" can no longer
  be created). `POST /api/providers` no longer rejects a provider name outside
  a fixed 3-name list — it rejects a name outside the catalog **only when no
  `baseUrl` is given** (`PROVIDER_CUSTOM_BASE_URL_REQUIRED`, still 400, but a
  different code than the previous generic "not a supported LLM provider"
  `QUERY_INVALID`). `PATCH`/`DELETE /api/providers/:provider` no longer gate
  on a fixed name list at all — they resolve against whatever the store
  actually has saved (a legitimately-saved custom provider used to be
  unreachable by these two verbs; the store's own `PROVIDER_NOT_CONFIGURED`
  already covered "this was never saved").
  
  **`@cogenta/cli`**: `packages/cli/src/commands/agent-runtime.ts`'s
  `createProviderRegistryAdapter` now supplies `names`/`catalog` from
  `KNOWN_PROVIDER_CATALOG` instead of the removed `PROVIDER_NAMES`, and no
  longer narrows an arbitrary string against a closed `ProviderName` union
  before trusting the live registry's own `has`/`get`. `assistant.ts`'s single-
  provider (`cogenta.config.mjs`'s `llm` section) resolution now accepts any
  provider `createProviderRegistry` itself can resolve — a catalog id, or a
  custom id paired with a `baseUrl` — rather than duplicating a fixed 3-name
  allowlist a second time (the exact desynchronisation risk this repo already
  hit once with `CONTRACT_C_PERMISSIONS`).
  
  **`@cogenta/admin`** (unpublished, no changeset entry): the "Providers"
  screen's "add" form is now catalog-driven — a provider `<select>` populated
  from `GET /api/providers/catalog`, a known-models picker per selected
  provider, and an explicit "custom provider" choice (its own id field, and a
  `baseUrl` the form requires before Save is enabled).
  
  Not included, by the fiche's own scope: Replicate (a different, asynchronous
  prediction-and-polling API, not OpenAI-compatible — a separate adapter, left
  for a later task).
- 4513a71: Import gains a real preview/apply/undo flow (fiche 25), on top of the existing
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
- bdcb563: L20 audit — six real bugs in the admin's diagnostic and dashboard screens,
  fixed:
  
  **`@cogenta/core`:** `DriverSelection`/`SkippedDriver` gain `reasonCode`
  (`DriverSelectionReason`/`SkipReasonCode`) alongside the existing `reason`
  string — a stable code a translated UI can look up instead of showing
  `createDriverRegistry`'s English prose ("named in the configuration", "redis
  not available") verbatim. Purely additive; `reason` is unchanged.
  
  **`@cogenta/api`:** `HealthDoctorCheck` gains an optional `reasonCode`
  field, carrying the same information through `GET /api/health-report`.
  
  **`@cogenta/cli`:** `cogenta serve` now actually constructs a
  `ScheduledTaskRegistry` and mounts `createScheduledTasksRouter` under
  `/api/scheduled-tasks` — before this, the admin's "Tâches planifiées" screen
  had real, tested client and server code on both ends, but nothing ever
  wired them together, so every request 404'd through the generic content
  router. The seven recurring jobs that used to run on independent
  `setInterval`s (scheduled publication, the tools-queue drain, the 404 log
  purge, audit integrity, the trash sweep, forms GDPR retention, channel
  notification flush, analytics retention) now run through one heartbeat
  driving `registry.tick()`, at the same per-task cadence as before — "run
  now" from the admin is real, and last-run/next-run/history reflect the
  actual thing. `RuntimeExtras` gains an optional `scheduledTasksRouter`.
  `DoctorCheck` gains `reasonCode` and a typed `skipped` shape, matching
  `@cogenta/core`.
  
  No breaking changes. A caller that never touches the new fields is
  unaffected; a site with no `ScheduledTaskRegistry` constructed by hand
  (a test harness building a bare `Site`) simply never gets the route mounted,
  same degradation as `agentsRouter`.
  
  Also fixed, admin-only (`@cogenta/admin`, private, no changeset): the
  "Vues par jour" analytics chart now draws one bar per calendar day of the
  selected period — zero-filled where the server sent nothing — instead of
  stretching a sparse response into a single filled rectangle; the "Interroger
  le site" assistant tab shows an honest state instead of rendering blank when
  a provider is configured but `assist.chat` specifically is disabled; and the
  Agents screen degrades to its already-honest "no agent running" empty state
  instead of showing the raw `"No route matches this path."` wire text when no
  `AgentRegistry` is mounted (still the case on every real `cogenta serve`
  today — that gap is documented, not new).
- 3cbd6d7: L22 task 5 — OpenTelemetry request tracing, a configurable log level, and
  an admin "Exploitation" > Observability screen, all on by default and
  working with zero external service (R1).
  
  **New package `@cogenta/observability`:** wraps `@opentelemetry/api` +
  `@opentelemetry/sdk-trace-base` (a real new dependency — see the task
  report for size and maintenance detail; this is the industry-standard
  choice, never a hand-rolled tracer). `createObservabilityRuntime` builds
  one server span per HTTP request (`withRequestTracing`) and a bounded,
  in-process "recent events" buffer (`ObservabilityRecentStore`, same ring-
  buffer shape `@cogenta/core`'s `createErrorLog` already uses) that the
  admin reads. A local NDJSON exporter runs always, needing no external
  service; an OTLP HTTP exporter runs in addition when an endpoint is
  configured — never one hardcoded vendor, any OTLP-speaking backend
  (Grafana, Datadog, …) works. `withRecentLogCapture` wraps any
  `@cogenta/core` `Logger` so its records also feed the same buffer, gated
  by a dynamic level getter rather than the logger's own fixed threshold.
  Every field passes through `@cogenta/core`'s `redact()` before storage —
  the same discipline the audit log already applies — and a trace only ever
  carries a request's method, path (query string stripped) and status code,
  never a header, cookie, or body.
  
  **`@cogenta/core`:** a new `observability` config section
  (`cogenta.config.mjs`) — `serviceName` and `otlpEndpoint`, resolved
  always, defaults needing nothing external. No `otlpHeaders` field, on
  purpose (rule R7, same shape as `payment`'s missing `stripeSecretKey`):
  those come from `COGENTA_OTLP_HEADERS`/`OTEL_EXPORTER_OTLP_HEADERS` only,
  refused if written to the file (`CONFIG_SECRET_IN_FILE`). `serviceName`
  and `otlpEndpoint` also honour the standard `OTEL_SERVICE_NAME`/
  `OTEL_EXPORTER_OTLP_ENDPOINT` environment variables as a fallback.
  
  **`@cogenta/schema`:** `SITE_SETTINGS_REGISTRY` gains a new `observability`
  group with two editorial settings — `observability.enabled` (default on)
  and `observability.logLevel` (`error`/`warn`/`info`/`debug`, default
  `info`) — changeable from the admin with no restart, unlike the OTLP
  export destination above.
  
  **`@cogenta/api`:** `createObservabilityRouter` — `GET /api/observability`,
  admin-only, read-only, answering the current `enabled` state plus the
  recent traces and logs.
  
  **`@cogenta/cli`:** `cogenta serve` wires all of the above — the HTTP
  listener is wrapped with `withRequestTracing`, the shared logger is
  wrapped with `withRecentLogCapture`, and `observability.enabled`/
  `observability.logLevel` are polled from the settings store every 15s
  (configurable via `ServeOptions.observabilitySettingsTickMs`, a test
  seam) so an admin's change takes effect without a restart.
- 249eb6f: Add the update system (L22 task 9): checking npm for a newer `@cogenta/core`/
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
- 29e4982: Add `@cogenta/theme-ecommerce`, a second installable public-site theme
  ("Storefront") built on the `@cogenta/theme-kit` foundation (fiche L23):
  a confident, product-grid-native retail identity across all twelve
  contract-B blocks — shoppable cards with consistent aspect ratios and hover
  lift, a full-bleed accent-colour promotional panel for `cta`, a horizontal
  "as seen in" trust strip for `logos`, tabular social-proof numbers for
  `stats` — with its own `renderChrome` (a bolder header, a multi-column
  footer) and a genuinely distinct light/dark design system (bright,
  high-contrast light mode by default; a real, separately designed dark mode,
  not an inversion). Registered in `theme-registry.ts`'s `BUILTIN_THEMES` and
  `@cogenta/cli`'s own `dependencies`, so it is selectable from the appearance
  screen's theme picker alongside the canonical reference theme, with no
  change to any existing site's rendering. Zero client JavaScript, WCAG 2.2 AA
  contrast verified in both colour schemes by a real computed-contrast test
  suite (233 tests).
- dda55d6: Fiche L23 (le thème unique, enfin réel) — l'infrastructure qui rend un second
  thème de site public installable, sans laquelle le reste du lot (les thèmes
  eux-mêmes, l'écran de sélection) n'aurait rien à brancher.
  
  **Le vrai verrou, précisément nommé** : `cogenta serve` importait
  `@cogenta/theme-canonical` de façon statique dans `theme-render.ts` — `renderPage`
  et, plus contraignant encore, le `<header>`/`<footer>` du site étaient
  littéralement écrits en dur dans le CLI, aux classes CSS de ce seul thème.
  Un second thème ne pouvait donc pas simplement fournir d'autres blocs : il
  lui fallait aussi un point d'extension pour sa propre bannière, qui
  n'existait pas.
  
  **Nouveau paquet `@cogenta/theme-kit`** : le contrat partagé qu'un thème
  implémente (`RenderContext`, l'arbre HTML sans échappatoire `raw()`, le texte
  riche, la section de commentaires, les aides d'entrée, `PageContent`, et les
  nouveaux types `ChromeInput`/`ChromeResult` du point d'extension) — sorti de
  `@cogenta/theme-canonical`, qui portait depuis L3 un commentaire s'excusant
  déjà que ce code soit une « maison temporaire ». Une seule copie, revue une
  fois, au lieu d'une copie par thème qui aurait fini par diverger — en
  particulier `ImageSource`/`ImageOptions` gagnent au passage `kind`/`poster`
  (contract D `theme@1.1`, déjà utilisé par `describeMedia` mais jamais exposé
  au thème lui-même) : le premier vrai support d'une vidéo en `hero`/
  `mediaFigure`, gratuit pour tous les thèmes à la fois. `@cogenta/theme-canonical`
  réexporte tout à l'identique — sa propre surface publique ne change pas.
  
  **Le registre de thèmes** (`@cogenta/cli`, `theme-registry.ts`) : une
  résolution par nom, mémoïsée, repliant tout nom absent ou inconnu sur
  `@cogenta/theme-canonical` plutôt que de refuser de servir (R1/R2).
  
  **Le point d'extension chrome** : `theme.renderChrome(input)` remplace le
  gabarit figé — chaque thème dessine désormais son propre en-tête/pied de
  page ; `cogenta serve` ne fait plus que résoudre la navigation et la mention
  de marque (toujours de sa responsabilité, jamais celle d'un thème) et les
  transmet. `@cogenta/theme-canonical` gagne ce `renderChrome`, produisant un
  HTML strictement identique à l'ancien gabarit — aucune régression visuelle
  pour un site existant.
  
  **Sélection en direct, sans redémarrage** : `cogenta_theme` (la même table
  que les réglages d'apparence) gagne une colonne `active_theme`, ajoutée en
  place à une table existante (le même geste que `menu-tables.ts` avait déjà
  fait pour `location`) — une base déjà provisionnée n'est jamais perdue.
  `GET/PUT /api/theme` connaît désormais la liste des thèmes installés et
  refuse un nom que cette instance ne sait pas résoudre (`THEME_NOT_FOUND`,
  404, nouveau dans la table de statuts). La feuille de style du thème actif
  est mémoïsée par nom (`createThemeCssResolver`) : changer de thème depuis
  l'écran d'apparence prend effet à la prochaine page vue, exactement la même
  promesse que la personnalisation de couleurs tient déjà.
  
  **Vérifié de bout en bout** : le thème canonique sert un document identique
  à l'ancien via `renderPageChrome`/`renderEntryPage` (472 tests `@cogenta/cli`,
  dont `serve.test.ts`/`serve-builder.test.ts` — la fidélité octet pour octet
  du constructeur de page L16 tient toujours), 121/121 `@cogenta/theme-canonical`,
  652/652 `@cogenta/schema`, 1052/1052 `@cogenta/api`. `pnpm turbo run typecheck`
  et `pnpm turbo run build` : 52/52 et 27/27 tâches, espace de travail entier.
  
  Ce lot n'ajoute encore aucun second thème installable — c'est la matière du
  prochain changeset. Sans cette fondation, un second thème n'aurait eu nulle
  part où brancher sa propre bannière.
- befad6d: `cogenta serve` fills contract D `theme@1.4`'s new `ChromeInput` fields and
  `PageContent.entry` (L25 D2).
  
  A new `resolveChromeExtras` (`theme-render.ts`) reads `general.tagline`/
  `general.socialLinks`/`general.footerNote` through whichever `ThemeRenderOptions.chromeExtras`/
  `PageChromeOptions.chromeExtras` reader the caller wires (`chromeExtrasForSite`, `serve.ts`),
  and resolves `headerAction` from the first link of the menu assigned to the
  `header-action` location — the same generic, name-free menu-location mechanism
  `header-nav`/`footer-nav` already use. Wired into all three `renderChrome` call sites
  (`renderPageChrome`, the entry page renderer, and — with fixed synthetic values, since
  that route reads no database by design — the theme gallery preview).
  
  An entry page (`renderRequestedPage`/`renderDraftPage`) now also builds `PageContent.entry`:
  cover image (`entryImage`), excerpt, publication/update dates, the entry's author (its
  `createdBy` resolved to a display name through the existing user store, via the new
  `ThemeRenderOptions.authorFor`/`authorForSite`), its classified taxonomy terms (via the
  new `ThemeRenderOptions.resolveTerm`, reusing the same lookup `resolveMenuTerm` already
  made for a menu item pointing at a term — exposed on `Site` as `resolveTaxonomyTerm`),
  and a reading-time estimate computed from the collection's `richText` field
  (~200 words/minute). Every one of these is optional and additive: a caller that never
  wires the new options renders exactly as before.
- cb62917: `cogenta mcp --api-key <key>` — resolve the MCP server's actor from a real API
  key, and a dedicated admin screen to mint one (L21 task 6).
  
  Until now, `cogenta mcp` could only run as a real user (`--email`), a
  synthetic test actor (`--role`), or anonymous — there was no way to generate
  a credential for an MCP client from the admin, the way REST already lets you
  via "Clés API". `--api-key` closes that gap by resolving through the exact
  same `ApiKeyStore` (`@cogenta/auth`) and "roles = scope" mapping REST's own
  `resolveActor` uses for a `cogenta_sk_…` bearer token — one store, two
  callers, never a second lookup path. A role the key was not granted is
  refused by the same `PermissionLayer` REST uses, exactly as it would be over
  HTTP (R4). `@cogenta/core` gains `MCP_ACTOR_API_KEY_INVALID` for an unknown,
  revoked or expired key.
  
  The admin gains a new **MCP** screen (`@cogenta/admin`, private, no
  changeset entry of its own), parallel to "Agents" rather than folded into
  the generic "Clés API" screen — same underlying key store, different
  audience: generating a key here also shows a ready-to-paste `cogenta mcp
  --api-key …` command and a standard MCP client JSON configuration block,
  both built from the raw key the server just returned, shown exactly once,
  same as the existing screen's own raw-key handling.
  
  See `packages/mcp/README.md` for the updated connection instructions.
- 5e43b20: `cogenta mcp` — a real MCP (Model Context Protocol) server, wired in (L20 audit).
  
  `@cogenta/mcp`'s server/transport existed, tested and unused since it shipped:
  no CLI command ever invoked it. `cogenta mcp` starts it for real, on the
  process's own stdin/stdout, built from this site's actual tool manifest
  (`buildManifest`, `@cogenta/agents`) — the same shape `cogenta serve` builds
  for REST/GraphQL, not a second implementation.
  
  **R4 applied for real**: `--email <email>` resolves the acting user from the
  site's own user store and runs every tool call with that user's real roles,
  checked by the same `PermissionLayer` REST and GraphQL use. `--role
  <role,role>` hands a synthetic actor for local testing. With neither, calls
  run as the anonymous `public` actor — content tools stay on the manifest and
  stay permission-checked (a public actor sees only what a public actor may
  see); media, site-config and HTTP-fetch tools, which have no permission
  check of their own, are left off the manifest entirely rather than exposed
  by default.
  
  `@cogenta/core` gains three error codes: `MCP_ACTOR_OPTIONS_CONFLICT`,
  `MCP_ACTOR_USER_NOT_FOUND`, `MCP_ACTOR_ROLE_EMPTY`.
  
  See `packages/mcp/README.md` for how to connect Claude Desktop, Claude Code
  or Cursor, and `BLOCKERS.md` §18 for the one known limitation: content
  written through this path is not (yet) re-indexed for search/vectors or
  redirect-tracked the way `cogenta serve`'s own write path is.
- b8d307a: Fiche 58: the "MCP" admin screen renamed to "MCP Server" (nav/i18n only, no
  functional change — task 1), and a real MCP **client**: this site's own agents can
  now consume external MCP servers, gated by a security review (`security-reviewer`,
  2026-08-26 — NO-GO as originally written, GO conditional on a sandboxing floor,
  re-reviewed against this final implementation before merge).
  
  **`@cogenta/mcp`**: `createMcpStdioClient` no longer inherits `process.env` —
  `spawn` receives exactly `options.env ?? {}`, never the host's real environment
  (the critical finding: the previous default handed a spawned third-party process
  every secret this server had, `COGENTA_AUTH_SIGNING_KEY` included, before
  `initialize()` was ever called). `stdio` is always `['pipe', 'pipe', 'pipe']`,
  never `inherit` — stderr is captured and logged through the structured logger,
  capped in size. Every JSON-RPC call has a hard timeout that kills the process and
  rejects every pending call on the connection; `wrapMcpTool`'s `execute` now honours
  `ctx.signal` too, so a run's own cancellation reaches the remote process the same
  way. A best-effort memory/CPU watchdog polls the spawned PID (`ps`/PowerShell, no
  native dependency — R9/R10); the real limit is host-level (cgroup, Job Object),
  documented as a prerequisite, not a guarantee.
  
  New `packages/mcp/src/registry/`: `McpConnectionStore` (table `mcp_connections`,
  secret encrypted at rest with the same AES-256-GCM/`COGENTA_AUTH_SIGNING_KEY`
  scheme as `@cogenta/agents`' `ProviderConfigStore` — R7), `discoverMcpConnection`
  (a real `initialize()` + `tools/list()` probe through the sandboxed client),
  `buildMcpToolDefinitions` (wires every enabled connection's checked tools into
  Contract C `ToolDefinition`s). `McpConnectionStore.create()` structurally refuses a
  `stdio` connection without `confirmUnsandboxed: true` — the mandatory, honest
  acknowledgement that this binary runs with the Cogenta process's own full OS
  privileges, unsandboxed beyond this package's floor; a UI can show the warning, but
  the refusal itself lives here. `setExposedTools()` refuses a remote tool name never
  actually seen in the connection's last discovered list — "absent, pas refusée": a
  tool the admin never checked is never wrapped for any agent. `http` is a stored
  transport (forward-compatible schema) with no working client yet — honestly
  refused (`discoverMcpConnection`), never silently pretended to work.
  
  **Contract C → `tools@1.4`** (`docs/04-contrats.md`): the parameterised permission
  `mcp.external:<connectionId>.<remoteToolName>` — one permission per checked remote
  tool, never per connection (`mcp.external.<connexion>` was rejected by the security
  review: it would grant every checked tool on a connection indifferently of its own
  risk, contradicting the "case à cocher par outil" principle and weakening R4). No
  existing tool signature changes — additive to an open taxonomy, the same kind of
  change `document.extract`/`logs.read`/`redirects.write`/`code.patch` already were.
  
  **`@cogenta/core`**: ten new error codes — `MCP_CLIENT_CALL_TIMEOUT`,
  `MCP_CLIENT_CALL_ABORTED`, `MCP_CLIENT_PROCESS_EXITED`, `MCP_CLIENT_SPAWN_FAILED`,
  `MCP_CLIENT_CLOSED`, `MCP_CLIENT_RESOURCE_EXCEEDED`, `MCP_CONNECTION_NOT_FOUND`,
  `MCP_CONNECTION_INVALID`, `MCP_CONNECTION_AUTH_INVALID`,
  `MCP_CONNECTION_CONFIRMATION_REQUIRED`, `MCP_CONNECTION_TOOL_NOT_DISCOVERED`.
  
  **`@cogenta/api`**: new `createMcpConnectionsRouter` (`/api/mcp-connections`,
  admin-only) — list/create/enable-disable/remove, `POST .../test` (a real discovery
  probe), `PUT .../exposed-tools` (the admin's checkbox decision). A new direct
  dependency on `@cogenta/mcp` (internal workspace package, not a third-party
  addition) for `discoverMcpConnection` and the store's types.
  
  **`@cogenta/cli`**: `cogenta serve` creates the connection table and store
  unconditionally (usable even without an LLM provider configured, same posture as
  `/api/api-keys`); `packages/cli/src/commands/agent-runtime.ts`'s `buildAgentRuntime`
  merges every enabled connection's checked tools into the site's real tool registry
  through a live-swappable wrapper (`createLiveToolRegistry`) — a connection
  created/tested/exposed from the admin screen becomes callable by an agent on its
  very next lookup, no `cogenta serve` restart, the same "no restart needed"
  guarantee `/api/providers` already gives. `AgentRuntimeAssembly` gains
  `refreshMcpTools()` and `mcpDispose()` (closes every spawned `McpClient` and
  removes every sandbox working directory on server shutdown). The fiche names
  `packages/agents/src/runtime/` for this wiring; it lives in `@cogenta/mcp`/
  `@cogenta/cli` instead — `@cogenta/mcp` already depends on `@cogenta/agents`, so
  the reverse dependency the fiche's own path would need is a package cycle. Deviation
  signalled, not silently worked around.
  
  Tests: `@cogenta/mcp` — the sandboxing floor (no inherited environment variable
  proven by inspecting what `spawn` actually receives while a real host secret is
  set; a hung server killed and rejected under a configured timeout; per-call abort;
  stderr capture), the connection store (confirmation requirement, encrypted secret,
  "absent, pas refusée"), discovery, and `buildMcpToolDefinitions` (one client shared
  across a connection's tools, a failed connection skipped not thrown, an end-to-end
  call through a fake stdio server). `@cogenta/api` — admin-only, the confirmation
  refusal, "absent, pas refusée" at the REST boundary. `@cogenta/cli` — a real,
  spawned `node` process (`test/fixtures/fake-mcp-server.mjs`) driven end to end
  through a real `cogenta serve`/SQLite/HTTP stack: connection created, tested,
  exposed, called by a real agent run with a scripted LLM vendor, proving the actual
  child process received none of the host's real environment
  (`COGENTA_AUTH_SIGNING_KEY` included) and that disabling a connection removes its
  tool from what an agent can call without a restart.
- 2285720: Menus gain a real editor (fiche `docs/plans/09-menus.md`):
  
  - **Edit an item in place.** `PATCH /api/menus/{id}/items/{itemId}` now accepts `label`, `kind`, the target fields, `title` and `openInNewTab` — no more delete-and-recreate to fix a typo. Changing `kind` clears the previous target rather than keeping a value that no longer applies. `parent` is deliberately not accepted here; re-parenting still goes through `POST .../move`.
  - **Bulk, transactional reorder.** `MenuStore.reorderItems` and `PATCH /api/menus/{id}/items` rewrite `parent`/`position` for any number of items in a single transaction, so a drag-and-drop or keyboard reordering session commits (or fails) as one unit — never a partially-rewritten tree if the network drops mid-session.
  - **Menu locations.** `Menu` gains `location: string | null` (`byLocation`, `GET /api/menus/by-location/{location}`) — where a menu renders (`primary`, `footer`, …), carried by the menu itself rather than baked into a theme's name convention. `@cogenta/cli`'s `ThemeRenderOptions` gains `headerMenuLocation`/`footerMenuLocation`, resolved generically by location with a fallback to the legacy `main`/`footer` name lookup, so an existing site's navigation keeps rendering unchanged. `@cogenta/core` gains the `MENU_LOCATION_TAKEN` error code for the one-menu-per-location-per-locale rule.
  - **Two new item kinds.** `taxonomy` (links to a term) and `home` (always resolves to `/`) join `entry`/`url`/`submenu-placeholder`.
  - **Target health.** A menu item resolver may now report `health` (`published`/`draft`/`scheduled`/`archived`/`trashed`) for an `entry` item — computed only for an actor whose role already has draft access to the target collection, so a public read never learns that a draft exists. `cogenta serve`'s public render hides a dead `entry`/`taxonomy`/`home` link entirely rather than serving one.
  
  All additions are backward compatible: `resolveEntry` gained a third `context` parameter and an optional `health` on its result, but a two-argument resolver still satisfies the type; every new field is optional or nullable on the wire.
- a6530f6: Taxonomy terms finally have a public page (contract D `theme@1.3`, additive).
  
  ADR-0022 shipped native taxonomies and the admin has let an editor point a menu item
  at a term ever since — and `resolveMenuTerm` answered `route: null` for every one of
  them, honestly, because no site rendered such a page. A term was a filing cabinet with
  no door.
  
  - `GET /{taxonomy}/{term-slug}` lists every published entry filed under a term, newest
    first, across every collection that classifies with it. `?page=N` paginates; page 2
    and beyond are `noindex, follow` with a canonical of their own.
  - `@cogenta/theme-kit` gains `TermArchiveInput` and `ThemeModule.renderTermArchive` —
    **optional**: a theme that does not implement it still serves the page, in its own
    chrome, through a plain host-rendered list. The five built-in themes each implement
    it with their own layout, reusing their own `collectionList` card classes so an
    archive looks like that theme's lists rather than a sixth design.
  - `resolveMenuTerm` returns a real route, so a taxonomy menu item is a link.
  - `/sitemap.xml` lists every term that has something published under it.
  
  Two decisions: the URL pattern is fixed and resolved by the host **after** every real
  collection route has failed to match — so a `/blog/:slug` route can never be shadowed,
  and a taxonomy needs no `routing` of its own (which would have been a contract A
  change ADR-0022 deliberately avoided). And a term archive lists that term only; its
  sub-terms are offered as links rather than folded in, so what the page shows always
  matches the term that was asked for.
- 9b1dae8: Fiche 43 sub-chantiers A, B, E, F (Cogenta Page Builder — motifs, copier/coller, verrouillage/sélection multiple, import/export) — extends the L16 visual page builder without touching contract A, B, C or D.
  
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
- 8a8d873: Add PayPal as a third, independently registered payment driver — proof that the payment
  gateway a shop uses is not a fixed Stripe/bank-transfer pair but an open registry
  (`@cogenta/commerce`'s `PaymentGateway` interface, the same `Driver<T, Config>` shape as
  cache/queue/storage), the concrete answer to "what if I don't want Stripe?".
  
  - `@cogenta/commerce` gains `payment/paypal.ts` (`paypalPaymentDriver`), written against
    PayPal's REST Orders v2 / Payments v2 API with `fetch`, no new dependency (R9), the same
    discipline as `payment/stripe.ts`: OAuth2 client-credentials token caching, a real
    RSA-SHA256 webhook signature check against a certificate fetched from
    `paypal-cert-url` (trusted only when its origin matches `apiBaseUrl` or is a genuine
    `*.paypal.com` host — a forged cert-url header cannot "verify" against its own key), a
    freshness window, and an explicit event whitelist so an unrecognised PayPal event is
    refused rather than guessed as `paid`. `fetch()` captures an order the moment it sees
    `APPROVED` (there is no separate capture verb in this project's narrow
    `PaymentGateway` interface), tolerating the one real race a concurrent poll can hit
    (`ORDER_ALREADY_CAPTURED`) by re-reading the order instead of failing. Registered in
    `payment/registry.ts` alongside Stripe (both `optimal`) ahead of the always-available
    `manual` driver (`degraded`).
  - `@cogenta/core`'s `payment` configuration section gains `paypal` as a named driver and
    three secret fields (`paypalClientId`, `paypalClientSecret`, `paypalWebhookId`), refused
    in `cogenta.config.mjs` the same way Stripe's are and sourced only from
    `COGENTA_PAYMENT_PAYPAL_CLIENT_ID` / `COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET` /
    `COGENTA_PAYMENT_PAYPAL_WEBHOOK_ID`.
  - `@cogenta/cli`'s `cogenta serve` passes the three PayPal fields through to
    `createPaymentRegistry` alongside the existing Stripe ones — no other wiring changed.
  - `@cogenta/admin` (private, no changeset): the payment screen is rebuilt from a
    two-card grid into a real provider list (WooCommerce's "Payment providers" pattern) —
    each row shows tier, configured/not-configured, active, and its own test-connection
    button — so a third driver appears with no change to the component, proving the point
    visually rather than only in code.
  
  PayPal's sandbox and live environments are different hostnames (`api-m.sandbox.paypal.com`
  vs `api-m.paypal.com`), unlike Stripe's single host with a test/live key prefix — an
  operator testing against the sandbox sets `payment.apiBaseUrl` explicitly, the same escape
  hatch the driver's own test suite uses to point at a local HTTP stub.
- dd9e9a2: Fiche 40 (diagnostics et messages d'erreur de configuration) — the exact bug
  the user reported: `preview-token.ts` already threw a `CONFIG_INVALID` error
  with a correct `hint` ("Set COGENTA_PREVIEW_SIGNING_KEY … `openssl rand -hex
  32` … never in a configuration file"), but the admin only ever read
  `caught.message`, throwing the `hint` away every time — so an editor clicking
  "Prévisualiser" without the key set never saw what to do about it.
  
  `@cogenta/api` exports `PREVIEW_SIGNING_KEY_MINIMUM_LENGTH` (`preview-token.ts`,
  was already an internal `32` — additive, no behaviour change) so `cogenta
  doctor` can check against the exact same number the token service enforces,
  rather than a second `32` copied by hand that could silently drift.
  
  `@cogenta/cli`'s `cogenta doctor` gains a proactive check: a missing or
  too-short `COGENTA_PREVIEW_SIGNING_KEY` is now reported in `notes` (a
  warning, same tier as the existing `COGENTA_STORAGE_SIGNING_KEY` note) —
  never in `problems`, since the key is only needed once a draft is actually
  previewed (`withPreview`, `packages/api/src/rest/router.ts`) and `doctor`
  must never fail a site over an optional feature.
  
  No contract touched: `PREVIEW_SIGNING_KEY_MINIMUM_LENGTH` is a plain
  constant, not a tool, permission, schema field or theme hook.
- 3075941: Fiche 45 — Prompt Settings, a shared, editable library for every utility prompt an `assist.*` tool sends the model. Until now, each instruction line (`assist.rewrite`, `assist.proofread`, `assist.summarise`, `assist.translate`, `assist.meta_description`, `assist.titles`, `assist.tags`, `assist.alt_text`, `assist.classify`, `assist.moderate`, `assist.faq_draft`, `assist.schema_org_draft`, `assist.chat`) was a literal string baked into the package.
  
  `@cogenta/agents` gains a new `prompts/` module: `PromptTemplateStore` (`createFilePromptTemplateStore` — one JSON file per template, same "real but local" tier as the existing agent/skill/provider stores, R1), `renderPromptTemplate`/`resolveInstruction` (`{{field}}` placeholder substitution that throws `PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED` rather than sending a literal unresolved placeholder to the model), and `builtinPromptTemplateSeeds`/`ensureBuiltinPromptTemplates` (thirteen templates reproducing every existing `assist.*` instruction verbatim as editable text, plus two new ones — `generate_text_block` for the future page-builder "Générer" button and `generate_agent_system_prompt` for the future agent-creation flow — written with the same care as a built-in agent's `identity.md`).
  
  Every migrated `assist.*` tool constructor now accepts an optional trailing `PromptTemplateStore` argument (`createWritingTools`, `createClassifyTool`, `createModerateTool`, `createFaqTool`, `createSchemaOrgTool`, `createContentChatTool`'s options). Backward compatible: omitting it (or a site whose store has never been seeded) reproduces the exact pre-existing hard-coded instruction, byte for byte — proven by a dedicated non-regression test comparing the seeded-store path against the original inline construction for every migrated tool. A tool's `role`/objectives and the R8 anti-injection rule stay in code, deliberately not migrated — they are the security boundary, not the prompt text an editor should be able to reword from a settings screen.
  
  `@cogenta/api` gains `createPromptTemplatesRouter` (`/api/prompt-templates`) — `GET` open to any signed-in actor, `POST`/`PATCH`/`DELETE` restricted to `admin`, mirroring `agent-skills-router.ts`'s shape. New `ErrorCode`s (`@cogenta/core`): `PROMPT_TEMPLATE_UNKNOWN` (404), `PROMPT_TEMPLATE_DUPLICATE` (409), `PROMPT_TEMPLATE_BUILTIN_UNDELETABLE` (409), `PROMPT_TEMPLATE_INVALID` (400), `PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED` (400).
  
  `@cogenta/cli`'s `cogenta serve` now builds a `PromptTemplateStore` under `.cogenta/agents-runtime/prompt-templates` (seeded on first boot, idempotent) and threads it through both `buildAssistant` (so the writing-assistant tools resolve their instruction text from it) and `buildAgentRuntime` (which mounts `/api/prompt-templates`) — the same directory, two file-store instances, safe because neither caches across calls.
  
  The admin's "Prompt Settings" screen (`packages/admin`, private, no changeset) is a new admin-only entry in the AI nav group: list/create/edit/delete a template, with a builtin always editable but never removable.
- e01efae: T09-04 (RGPD, audit 2026-09-01) — `exportPersonalData` (`@cogenta/export`) had zero
  callers anywhere in the codebase; the legal obligation it exists to satisfy was not
  exerciseable. `@cogenta/api`'s `users-router.ts` gains `GET /api/users/{id}/personal-data`
  (self-or-admin, the same rule `GET /{id}` itself already follows) — assembles the
  account, every collection entry it authored (via the same `storeFor` REST/GraphQL/theme
  rendering already share, now a `UsersRouterOptions` field), and the honest `gaps` array
  `exportPersonalData` reports for domains this codebase has no store for yet. The export
  is itself journalled (`user.personal_data_export`, naming whether it was a self-request
  or an admin acting on a third party). `cogenta serve` wires `storeFor` into the router;
  the admin gains an "Export my personal data" button on the profile screen (every role,
  self only) and an "Export the personal data of {{email}}" action per account row on the
  Users screen (admin, any account). New direct dependency `@cogenta/api` → `@cogenta/export`
  (R9: reusing an existing, tested assembly function rather than a second one).
  
  T09-01 — `AuditLog.prune()` (`@cogenta/auth`) has existed since fiche 21 task 5 with no
  scheduled caller, so an audit log grew without bound on every site regardless of
  retention intent. `@cogenta/core` gains `security.audit.retainDays` (optional; absent —
  the default — changes nothing, `0` is the explicit "never purge" opt-out). `cogenta
  serve` registers a new daily `audit-prune` scheduled task (`Site.tickAuditPrune`) that
  purges entries older than the configured window and journals the purge itself
  (`audit.prune`, naming `retainDays`/`cutoff`/`prunedCount`) — a no-op when unconfigured.
  
  T09-02 — `errorResponse` (`@cogenta/api`) gains a generic `Retry-After` header for any
  `CogentaError` whose `details.retryAfterMs` names a concrete backoff (only the derived
  integer ever reaches the wire, never `details` itself). `AUTH_RATE_LIMITED` — thrown by
  login and forgot-password rate limiting — is the first beneficiary: a 429 that used to
  say "try again later" in prose now carries a real, pollable `Retry-After`.
- 5de237f: Fiche 63 (ADR-0028) — a role's grant on a collection or taxonomy action can
  now be overridden in the database, applied on the very next request with no
  deploy cycle. `cogenta.schema.*`'s `permissions` block stays the source of
  truth for a site that never writes an override; the database is checked
  first and falls back to the file, never the other way around.
  
  `@cogenta/core` gains three error codes: `ROLE_PERMISSION_TARGET_UNKNOWN`
  (404 — an override names a collection/taxonomy the site does not declare),
  `ROLE_PERMISSION_INVALID` (400 — a malformed override, including `own` on a
  taxonomy, which has no author) and `ROLE_PERMISSION_EXPORT_INVALID` (a
  malformed `cogenta roles export` file being read back).
  
  `@cogenta/schema` gains `createRolePermissionStore` (validates every write
  by folding the candidate rule into the real `CollectionDefinition`/
  `TaxonomyDefinition` and reusing `defineCollection`/`defineTaxonomy`
  unmodified — no second validation logic), `createRolePermissionOverlay` (the
  synchronous, refreshable read-through cache `PermissionLayer` consults),
  `ensureRolePermissionTable`/`ROLE_PERMISSIONS_TABLE`, and
  `serialiseRolePermissionExport`/`parseRolePermissionExport` for freezing the
  table's state into a versioned JSON file. All additive; contract A
  (`CollectionDefinition`, `TaxonomyDefinition`, `CollectionPermissions`) is
  unchanged — the override table lives entirely outside the contract.
  
  `@cogenta/api`'s `createPermissionLayer` gains an optional
  `rolePermissionOverrides` option (a `RolePermissionOverrides` from
  `@cogenta/schema`) — absent behaves byte-for-byte as before. A new router,
  `createRolePermissionRouter`, serves `GET`/`PUT /api/role-permissions` and
  `DELETE /api/role-permissions/{targetType}/{targetName}/{action}`,
  admin-only. `STATUS_BY_CODE` gains the two new HTTP-mapped error codes above.
  
  `@cogenta/cli` wires the override store and overlay into `cogenta serve`
  (mounting `/api/role-permissions`, journaling every successful write to the
  audit log), `cogenta mcp` and `cogenta channels` (each builds its own
  `PermissionLayer`, so each needed the same wiring — otherwise a permission
  revoked in production would stay granted to those processes until restart).
  A new command, `cogenta roles export [--out <path>]`, freezes the table into
  a file a site can commit to git.
- 745ebd8: Editorial workflow and owner permission (`schema@2.1`, ADR-0027, fiche 37 + fiche 19
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
- 4bb6ba3: Fiche 50, tasks 1-5 — direct sitemap/robots.txt links from the Diagnostic tab, Search Console/Bing site verification (meta tag only, no OAuth — R1/R7), a hand-written robots.txt addendum, and wiring the two indexing extras (`indexnow.ts`/`llms-txt.ts`) that were written and unit-tested since L3/L9 but never reachable from any route or setting. Task 6 (RSS/Atom) is explicitly out of scope, per the fiche's own "à confirmer".
  
  - **`@cogenta/seo`**: `RobotsOptions` gains `customRules` — an admin's own robots.txt lines, merged in verbatim by `renderRobotsTxt` after the derived group(s) and before the `Sitemap:` directive. New export `robotsRuleDisallowsEverything(text)` — true when `text` contains a bare `Disallow: /`, so a caller (the admin's custom-rules editor, in particular) can confirm before saving a rule that would block every crawler.
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY`'s `seo` group gains six settings — `seo.googleSiteVerification`/`seo.bingSiteVerification` (meta-tag verification tokens), `seo.robotsCustomRules` (free text, merged into `/robots.txt`), `seo.indexNowEnabled`/`seo.indexNowKey` (off by default), `seo.llmsTxtEnabled` (off by default). All admin-only, all in the existing `SiteSettingsStore` — no new table.
  - **`@cogenta/api`**: `SeoRouterOptions` gains `robotsCustomRules` (an async getter, same "read live" contract as `titleDefaults`) — the Diagnostics screen's `robots.content` preview now shows the exact document `/robots.txt` serves, custom rules included, and `disallowsEverything` also flags a custom rule that blocks every crawler.
  - **`@cogenta/cli`**: `seo.ts`'s `SeoRenderDefaults` gains `googleSiteVerification`/`bingSiteVerification`/`robotsCustomRules`; new export `siteVerificationMetaTags` renders the two `<meta>` tags. New export `SeoOperationalSettings`/`readSeoOperationalSettings` for the two off-by-default extras. `RobotsRenderOptions`/`renderRobots` gain `customRules`. `PageChromeOptions` (`theme-render.ts`) gains `seo`, so `/search` and `/forms/{name}` carry the same verification tags every entry page does. `cogenta serve` gains `GET /llms.txt` (404 unless `seo.llmsTxtEnabled`) and IndexNow's ownership-proof key file at `/<key>.txt` (served only when the requested key matches the configured one), and pings IndexNow on a successful publish/unpublish response when `seo.indexNowEnabled` is on — never blocks or fails the response it follows.
  
  Admin (`@cogenta/admin`, private, no changeset): the SEO screen's Général tab gains a search-engine-verification card and an IndexNow/llms.txt card (with a "Generate a key" button); the Diagnostic tab gains "Open sitemap.xml"/"Open robots.txt" links and an editable robots.txt custom-rules field that asks for confirmation before saving a rule containing `Disallow: /`.
- 960757d: Fiche 70 (SEO platform parity — AIOSEO/The SEO Framework/MonsterInsights/Site
  Kit) — four tasks closing the gaps a real research pass found against those
  four tools, which the earlier SEO fiches (13, 50) never looked at.
  
  **Task 1 — real-time content score.** `@cogenta/seo` gains `analyseContent`
  (`content-analysis.ts`): a pure, synchronous TruSEO-style scorer over
  contract A's rich text — keyword usage in title/description/first sentence,
  keyword density, sentence length, subheadings, content length. Returns a
  closed `'red' | 'orange' | 'green'` score, never a numeric percentage. A new
  conventional field, `seoFocusKeyword`, joins `seoTitle`/`seoDescription`/etc.
  (contract A untouched). The admin panel keeps its own mirrored copy of the
  algorithm rather than depending on `@cogenta/seo`/`@cogenta/schema` — the
  admin is a browser bundle and never takes that dependency.
  
  **Task 2 — internal link assistant.** `@cogenta/seo` gains
  `analyseInternalLinks` (`link-assistant.ts`), reusing `@cogenta/schema`'s
  existing `extractLinks`: reports entries with no inbound link and, for
  entries sharing title words, up to five link candidates. `@cogenta/api`'s
  `createSeoRouter` gains `GET /api/seo/link-suggestions?collection=…`, gated
  by `update` on the named collection (never `admin`) so an editor can run it
  on whatever they may already write.
  
  **Task 3 — SEO feature grid.** Four new `seo.*` boolean settings
  (`contentScoreEnabled`, `linkAssistantEnabled`, `searchVerificationEnabled`,
  `robotsCustomRulesEnabled`) in `@cogenta/schema`'s site settings registry,
  all defaulting to `true` so an upgrading site's behaviour is unchanged. The
  last two are gated centrally inside `@cogenta/cli`'s `readSeoRenderDefaults`,
  so every consumer (public `robots.txt`, verification meta tags, the
  diagnostics scan) honours the toggle with no per-call-site duplication.
  
  **Task 4 — optional Google Search Console connector (ADR-0032).**
  `@cogenta/seo` gains `search-console.ts`: a fetch-only OAuth client (no
  `googleapis` SDK) for the authorization URL, token exchange/refresh, and one
  read-only `searchAnalytics.query` call — structurally incapable of writing
  anything on the Google side. `@cogenta/schema` gains
  `createSearchConsoleConnectionStore`: one site-wide connection row,
  AES-256-GCM at rest via `COGENTA_AUTH_SIGNING_KEY` (same discipline as the
  LLM provider store), full SQLite/Postgres/MySQL/MariaDB contract suite.
  `@cogenta/api` gains `createSearchConsoleRouter`
  (`/api/seo/search-console/*`): `status`/`authorize`/`metrics`/`disconnect`
  are admin-only; `callback` (Google's own browser redirect target) carries no
  bearer token by design, proven legitimate instead by an HMAC-signed,
  ten-minute `state` token keyed by `COGENTA_AUTH_SIGNING_KEY`. `@cogenta/core`
  gains the `searchConsole` config section (client id/secret, environment-only,
  refused in the config file like every other secret) and five new error codes
  (`SEARCH_CONSOLE_NOT_CONFIGURED`/`_NOT_CONNECTED`/`_STATE_INVALID`/
  `_TOKEN_EXCHANGE_FAILED`/`_QUERY_FAILED`). Absent without both
  `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` set — every other SEO
  feature, including tasks 1-3 above, works identically with or without it
  (R1/R2), which was the explicit condition the user set when accepting
  ADR-0032.
- 2d84729: Fiche 21, task 3 — merge SEO + Redirections into one admin screen, and make sitemap/social/title settings real and admin-editable (previously "read-only by design", a scope choice of a previous lot rather than an ADR).
  
  - **`@cogenta/seo`**: `MetadataOptions` gains `fallbackImage` — a site-wide default Open Graph/Twitter Card image, used by `buildMetaTags` only when neither the caller's own `image` nor the resource's `seoImage`/first `media` field resolves to anything. `SitemapOptions` gains `collectionOverrides` (new exported type `SitemapCollectionOverride`) — per-collection `included`/`changefreq`/`priority`, applied by `sitemapUrlsFor`; `included: false` drops every entry of that collection from the sitemap outright.
  - **`@cogenta/api`**: `SeoRouterOptions.titleTemplate`/`collectionTitleTemplates` (static, and never actually wired to anything — dead since the fields were added) are replaced by `titleDefaults`, an async getter read fresh on every diagnostic scan and SEO preview, mirroring the "read live, never cached at startup" contract `@cogenta/cli`'s `ThemeRenderOptions.homePath` already uses. **Breaking** for any direct caller of `createSeoRouter` passing the old static fields.
  - **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY` gains a `seo` group — `seo.titleTemplate`, `seo.collectionTitleTemplates`, `seo.defaultMetaDescription`, `seo.sitemapCollectionSettings`, `seo.twitterHandle`, `seo.defaultSocialImageUrl` — persisted through the same `SiteSettingsStore` `settings.tsx`'s Général/Reading/Discussion tabs already use, no new table or migration.
  - **`@cogenta/cli`**: `seo.ts` gains `SeoRenderDefaults`/`readSeoRenderDefaults` (reads the six settings above, live); `seoSiteFor` and `HeadOptions`/`renderSeoHead` take an optional `seo`/`SeoRenderDefaults` to apply the title template, per-collection template override, default meta description, Twitter handle and fallback social image; `buildSitemapFiles` takes an optional `collectionOverrides`. `ThemeRenderOptions` gains `seo?: () => Promise<SeoRenderDefaults>`, wired into every render path in `cogenta serve` (published page, page-builder preview, admin SEO preview redirect check, `/sitemap.xml`) so a saved setting shows up on the very next request, no restart.
  
  Admin (`@cogenta/admin`, private, no changeset): `/seo` and `/redirects` merge into one nav entry ("SEO") with five tabs — Général, Sitemap, Réseaux sociaux, Redirections (the previous `redirects.tsx` screen, unchanged, now `RedirectsPanel`), Diagnostic (the previous read-only reports, unchanged, now loaded lazily only when that tab is opened). `/redirects` still resolves (redirects to `/seo?tab=redirects`), the same pattern already used for `/site-plan` → `/create-site`.
- b50f7bb: Fiche 35 (coquille et navigation): the admin sidebar is now grouped by
  domain (Contenu, Apparence, Boutique, IA, Comptes, Exploitation,
  Réglages) and filtered by role, active features (a shop-less site has
  no Boutique group) and available capabilities (no AI provider reduces
  the IA group to its explanation page) — a contributor sees six entries
  instead of twenty-three. Adds a collapsible/responsive sidebar with a
  mobile drawer, aggregated badges (trash count, orders to process) from
  one request rather than one per badge, a breadcrumb with a
  per-navigation `document.title`, and `⌘K`/`Ctrl+K` command-palette
  actions on top of the existing search. `@cogenta/api` gains
  `createShellStatusRouter` (the single aggregated status read the
  badges and feature gates use). `@cogenta/cli`'s `theme-render.ts`
  renders a thin "edit this page" admin bar on the public site for an
  authenticated visitor only, never for an anonymous one.
- 835d736: L22 task 3: "l'agent qui surveille le site" — the one concrete case the lot's spec asks to ship first, tested end to end against a real `cogenta serve`. A superagent-shaped agent, disabled by default like the other two examples, that reads the public 404 log (never source code, never a request body or an IP — the log itself carries neither), picks a genuinely related, routed page, and proposes or creates a redirect depending on the site's configured autonomy — reusing the runtime `withAutonomyForManifest` already built for L22 task 1, not a bespoke gate.
  
  `@cogenta/agents` gains a fourth built-in agent, "Site Monitor" (`SITE_MONITOR_AGENT_NAME`, `builtins.ts`), disabled by default with a daily cron trigger, autonomy `propose` by default — raising it to `autonomous` (autopilot) is what the lot names as the condition for an *applied*, not merely *suggested*, redirect. Four new contract-C tools back it: `logs.read_not_found` (new permission `logs.read`, read-only over `@cogenta/schema`'s `NotFoundLogStore`), `content.collections`/`content.list` (both under the existing `content.read` permission — browsing is the same access as reading one entry, not a wider grant), and `redirects.create` (new permission `redirects.write`, `sideEffects: true`, `reversible: true` — its `revert` removes exactly the redirect it created). Contract C moves to `tools@1.2` (`docs/04-contrats.md`): two permissions added by the bottom to an open taxonomy, no existing tool signature touched — the same kind of change `document.extract` was in `tools@1.1`.
  
  `@cogenta/schema`'s `RedirectReason` gains a fourth value, `'agent'` — `redirects.create` always writes it, never `'manual'`, so an admin looking at the Redirections screen can tell which rows a human typed and which one an agent proposed and had applied. Additive to a stored, open list (not a versioned contract enum); a row written by an older build still reads back fine (`toRecord`'s existing fallback to `'manual'`).
  
  `@cogenta/api` gains `createMonitoringRedirectSuggestionSource` (`notices/monitoring-redirect-suggestion.ts`) — the dashboard half: a redirect an agent proposed under `co-pilot` autonomy surfaces as an admin notice (from/to, which agent), linking straight to the *existing* Redirections screen rather than a second confirmation UI, and disappears on its own once the redirect exists (created by hand, or later applied under `autopilot`) — never because the underlying `ApprovalQueue` request was "decided" (L22 task 1's queue still has no admin surface to decide anything from).
  
  `@cogenta/cli`'s `agent-runtime.ts` wires all four new tools into the site's real tool registry (the real `NotFoundLogStore`/`RedirectStore`/`CollectionDefinition[]` `serve.ts` already builds, never a second instance) and now exposes the runtime's `ApprovalQueue` on `AgentRuntimeAssembly` so `serve.ts` can build the notice source over the exact same queue `co-pilot` autonomy files into. `serve.ts` adds one more entry to the notices sources array — the seam fiche 38 designed this mechanism around — and threads `collections`/`notFoundLog`/`redirects` into `buildAgentRuntime`.
  
  R2 holds throughout: with no LLM provider configured, the Site Monitor exists in configuration (seeded, listable, editable) and attempts zero network calls — `AgentRunner.run()`'s existing `AGENT_NO_PROVIDER` guarantee, unchanged, covers this agent the same as every other one.
  
  **Deliberately out of scope, named honestly rather than silently promised**: server-error and downtime detection (the lot's own other two example anomalies) are not built — this task ships the one case the spec asks to land first, tested end to end; the other two stay documented ideas for a future lot.
  
  No new dependency (R9): every new tool wraps a store or a route this project already had (`NotFoundLogStore`, `RedirectStore`, `ContentService.summary`/`list`, `buildPath`), and `@cogenta/agents` already depended on `@cogenta/schema`.
- cf005d4: Fiche 60: site plan generation gains conscience of the site it would join. Before this, a plan proposed from the admin on a site with two hundred articles and a live shop looked exactly like a plan proposed on an empty database — the only contact with reality was `site-plan.ts`'s late, defensive "this collection name is already taken" refusal at *apply* time, never an entry of the agent's own reasoning.
  
  `@cogenta/agents` gains `describeExistingSite`/`ExistingSiteSnapshot` (`site-plan/site-context.ts`): a plain-data snapshot of a site's declared collections (name, fields, entry/published counts), taxonomies, active theme and configured integrations — built by the caller (no database dependency inside this package), and rendered to text only for `assembleContext`'s tagged `data` channel (R8: the whole rendering goes through escaping uniformly, since a collection's own `labels` are free text an operator or an earlier agent chose).
  
  `analyseBrief`, `proposeContentModel` and `generateSkinCandidates` gain an optional `existingSite` parameter, threaded through `proposeSitePlan`. Absent (the installer's own path, on a fresh site) or an empty snapshot, every request stays byte-for-byte what it always was — proven by tests comparing the two paths' requests directly. `generateSkin` (`skin/generate.ts`) gains an optional `context` (tagged data items) it did not have before, used only when `generateSkinCandidates` is given a populated `existingSite`; every existing caller keeps its exact single-message request.
  
  Given a populated `existingSite`, `proposeContentModel` switches to "évolution plutôt que premier jet": the prompt asks for complements rather than a redefinition, and — never trusting the model alone, the same discipline `enforce.ts` already applies to explicit constraints — any collection proposed anyway under a name the site already declares is dropped structurally and reported in the new `skippedExisting` result field, surfaced as a plan warning.
  
  New deterministic pass `detectStructuralGaps` (`site-plan/structural-gaps.ts`): compares the proposed pages and the existing site against a closed list of pages most sites need (contact, legal notice, privacy policy) and suggests only what neither already covers — never generated automatically (R6). `SitePlanDraft` gains `structuralGaps`, and `summarisePlan`/`resolveApprovedPlan` (`site-plan/approval.ts`) gain a new `structuralGaps` review section between `pages` and `skin`; an accepted suggestion joins the approved plan's `pages`, exactly as reviewable and exactly as unapplied-by-itself as every other item.
  
  `@cogenta/cli`'s `site-plan.ts` gains `buildExistingSiteSnapshot`/`ExistingSiteContext`/`detectActiveIntegrations` (all exported for testing) and wires the snapshot into `createPlanner`, read fresh on every proposal — never cached across the process's lifetime, the same discipline `theme-wiring.ts` documents for its own token overlay. `SitePlanningOptions` gains an optional `taxonomies` field; `serve.ts` passes the taxonomies it already loads. The installer entry point (`create-cogenta`) is untouched — on a new site, `existingSite` is empty by construction, so its behaviour is unchanged.
  
  Admin: "Créer un site" is renamed "Générer le site" (`nav.createSite`, `sitePlan.heading`, the onboarding guide's step 4) in both locales — the review screen itself needed no code change, since it already renders whatever sections the server returns.
  
  No new dependency (R9). No contract touched: this is read access already covered by `PermissionLayer` (R2/R4), consistent with ADR-0023.
- a6530f6: `cogenta serve` now serves `/feed.xml` (RSS 2.0) and `/atom.xml` (Atom 1.0), and every
  page advertises them from its `<head>`.
  
  `@cogenta/seo`'s `feedItemsFor`/`renderRssFeed`/`renderAtomFeed` were written and
  unit-tested in L3 and never reached a route: a Cogenta site simply had no feed, which
  is parity Ghost, WordPress and Hugo all ship out of the box. Both are read the same
  `ANONYMOUS` way `sitemap.xml` and `robots.txt` are, and on by default — a feed
  publishes only what is already published, at URLs already in the sitemap, so there is
  nothing here for an operator to consent to.
  
  Also fixes the public admin bar (fiche 35 task 6), which had **never rendered**: its
  renderer existed and the one dispatch meant to enable it never set the flag. Now that
  it appears, its three labels are translated (fr/en, following the page's own language)
  and its first one follows the same white-label switch as the footer credit, instead of
  saying "Cogenta Admin" on every site.
- 19fe157: Fiche L24 tâche 5 (aperçu visuel des thèmes) — the appearance screen's theme
  picker gains a real visual preview per theme, not the five text-only cards it
  had since fiche L23.
  
  `@cogenta/cli` gains `renderThemeGalleryPreview` (`theme-render.ts`) and the
  new admin-only route `POST /api/theme/gallery-preview`: it renders one fixed,
  database-free demo page (hero + collectionList + featureGrid, the same shape
  `create-cogenta`'s "blog" blueprint seeds a real home page with) through
  whichever installed theme package the request names, and returns the
  resulting HTML for the admin to show in an iframe — the same "iframe on the
  real server render, never a screenshot or a second React reimplementation of
  the twelve blocks" principle the visual page builder (fiche L16) already
  established. The route never touches `ContentGateway`: it cannot leak draft
  or private content, and it works identically on a site with zero content
  seeded yet, which is exactly when an admin is most likely to be comparing
  themes.
  
  The demo content is fixed and identical across every theme on purpose —
  letting one theme's card look richer than another's because *this site's*
  real home page happens to use more blocks would make the comparison
  meaningless.
  
  `Site` gains `themeGalleryStyles?: (themeName: string) => Promise<string |
  null>`, resolving the combined skin + *that theme's own* stylesheet by name
  — distinct from `resolveStyles`/`previewStyles`, which both resolve against
  the currently active theme only. Absent under the same condition every other
  theme field on `Site` is (no theme wiring — a test harness that does not
  care about appearance).
  
  No contract touched: this is server-side rendering wiring, not a change to
  contract B, D or the theme registry's resolution rules.
- 17727db: Add `@cogenta/theme-portfolio`, an ultra-modern creative-portfolio theme built on the
  `@cogenta/theme-kit` contract every theme now implements against (fiche L23). It ships
  alongside `@cogenta/theme-canonical` in `theme-registry.ts` and `cogenta serve`'s
  appearance screen, selectable per site without a restart.
  
  All twelve contract-B blocks get their own distinctive DOM and layout — a numbered
  "plate" caption on `mediaFigure` (CSS counters, not stored data), an editorial index
  list for `collectionList`, an inverted full-bleed panel for `cta`, a hairline-ruled
  "selected clients" ledger for `logos` — rather than a recolour of the reference theme's
  markup. Its own default skin (`tokens.json`) picks a near-black-on-near-white palette
  with a single electric-violet accent, Bricolage Grotesque/Fraunces/JetBrains Mono via
  Google Fonts (each with a real system fallback stack), and its own dark-mode derivation
  in `tokens.css`: light mode expresses elevation as a hard offset shadow (from the skin's
  own `shadow.sm`/`shadow.md`), dark mode replaces that mechanism entirely with an
  accent-tinted glow ring rather than merely dimming the shadow — a distinct design
  decision from the reference theme's own dark palette, computed and AA-verified in both
  schemes by a real contrast test against the rendered stylesheet.
  
  Zero client JavaScript (asserted: no `<script>`, no `on*` handler, no `client:*`
  directive), zero literal colour in any stylesheet, and no new dependency beyond what
  `@cogenta/theme-canonical` already uses.
- 421cf33: `cogenta serve` now actually sweeps the trash. `purgeExpired()` has existed on
  every `ContentStore` since ADR-0022, but nothing called it — a site's trash
  grew forever despite `trash.retainDays` implying otherwise. `runServe` now
  ticks it once at startup and then on a daily `setInterval` (override with
  `trashPurgeTickMs`, mirroring `scheduledPublishTickMs`), one collection's
  expired rows at a time, never fatal per collection.
  
  `createOpsStatusRouter` gains an optional `trash` provider and a third route,
  `GET /api/trash-status` (admin-only, same as `/api/security-status` and
  `/api/webhooks-status`): `{ retainDaysByCollection, lastRunAt, lastPurged }`,
  so an admin screen can say when the sweep last ran instead of only that it is
  configured to happen. A caller that does not wire `trash` gets an honest
  all-empty answer instead of a crash.
  
  Fixes a real gap in the audit log: `POST .../untrash`, `POST .../purge`,
  `POST .../unpublish` and `POST .../duplicate` were silently unaudited —
  `recordContentAudit` only ever recognised `publish` and `restore` among
  sub-actions, treating every other one as a read. All four now record
  `content.untrash`, `content.purge`, `content.unpublish` and
  `content.duplicate` respectively.

### Patch Changes

- 08e394b: A real, persisted conversation with an agent, and two robustness fixes found by using it live against DeepSeek.
  
  **The conversation.** Two chat surfaces — the agent detail page and the floating widget — used to keep their own local transcript, so starting a conversation on one and reopening the other never "loaded" it: there was nothing server-side to load. `@cogenta/agents` gains `AgentConversationStore` (memory + file implementations, one per `(agentName, actorId)` thread) and `RunAgentOptions.history` (real prior turns threaded into the model call, not folded into the instruction text); `@cogenta/api`'s `agents-router.ts` gains `GET/DELETE /api/agents/:name/conversation` and `POST .../conversation/messages`; `@cogenta/cli` wires a file-backed store under `.cogenta/agents-runtime/conversations`. Both admin chat surfaces now read and write through the same thread.
  
  **Found while testing it for real:**
  - A content-generation reply came back empty (`stopReason: 'max_tokens'`) — the default per-call budget (2000 tokens) was tuned for a short reply, not a real draft with a rich-text body. Raised to 8000 (6000 for a sub-agent hop).
  - A stalled DeepSeek response left the request — and the browser tab awaiting it — hanging for minutes with nothing logged and no way to recover short of killing the process. None of the three provider adapters (OpenAI-compatible, Anthropic, Google) ever bounded a call on their own. Each now falls back to a 180s timeout when the caller supplies no cancellation signal of its own, and reports a named "did not answer in time" error rather than hanging forever.
  
  Also: the `content.schema` tool (introspects a collection's field shape and the block vocabulary — closes the gap where the superagent could only guess field names when asked to draft content) is now visible in the admin's own permission checkboxes, and the superagent detail page opens straight on the chat, with every configuration field moved behind a "Réglages" button, and the technical log truncated with a "show all" toggle.
- 08e394b: Gives an agent a way to learn a collection's actual field shape before writing to it. A live run asked the "Cogenta Agent" superagent "peux-tu générer un template ?" and it answered by asking the human to specify every field itself — `content.write_draft`'s `values` input is deliberately schema-blind (`z.record(z.string(), z.unknown())`), so nothing let the model discover a collection's real field keys short of guessing or reverse-engineering an existing entry, and a fresh collection with zero entries left it nothing to reverse-engineer at all.
  
  `@cogenta/agents` gains a new contract-C tool, `content.schema` (`createContentSchemaTool`), read-only under the same `content.read` permission as the existing browse pair (`content.collections`/`content.list`) — describing a collection's shape is not a wider grant than reading one of its entries. It answers two things: one or every readable collection's field shape (key, kind, required, label, kind-specific options), and this site's fixed block vocabulary (contract B's seventeen blocks, each with its own name/version/field shape) — the block half needs no site data at all, it is always present so an agent building a `blocks`-kind field's value never has to guess what a `hero` or `prose` block actually holds. The "Cogenta Agent" seed gains it alongside the existing browse pair, and `ensureBuiltinAgents` grants it to an already-seeded built-in that holds `content.read`, exactly like `content.collections`/`content.list` before it.
  
  `@cogenta/agents` gains a new direct dependency, `@cogenta/blocks` (workspace-internal, zero transitive cost) — the same package `@cogenta/theme-canonical`/`@cogenta/theme-kit` already depend on to read the same fixed vocabulary.
  
  `@cogenta/cli`'s `agent-runtime.ts` wires the new tool into the site's real tool registry with a `contentSchemaServiceLikeOf` adapter that reuses the exact same `ContentService.summary()` permission check `content.collections` already goes through, so `content.schema` never describes a collection the calling actor could not otherwise read.
- 168ee37: Wires the new `@cogenta/theme-association` package into `cogenta serve`'s
  theme registry and dependency list (L25, Phase 1) — a site can now select
  "Association" from the theme gallery, and the `association` blueprint's
  `defaultTheme` resolves to a real, installed theme instead of falling back
  to canonical. `create-cogenta` gains the `association` starting skin (a
  warm off-white ground with a deep-green accent), matching the theme's own
  default look before any AI-generated skin is chosen.
  
  Also fixes a real privacy bug found while verifying this theme end to end:
  a public entry byline (`PageContent.entry.author`, contract D `theme@1.4`)
  used to fall back to an author's login email when their account had no
  display name — exactly the `displayName ?? email` fallback the
  authenticated `admin-*` screens already use safely in a private context.
  `create-cogenta` only ever asks for an email, so a freshly scaffolded
  site's admin account has no display name by default, meaning **every**
  themed site with author bylines enabled was publishing its own admin's
  login email on the very first page a visitor could open. The byline is now
  omitted rather than naming an email; a real display name still shows once
  one is set.
- 0c7ecef: Audit A1-commerce (P2) — open carts nobody touches are now actually marked
  abandoned, automatically.
  
  `CartStore.abandon()` has existed since fiche 32 with no automatic caller: a shop's
  open carts stayed `status: 'open'` forever, even weeks after a shopper vanished.
  `CartStore` gains a new method, `abandonInactive(options?: { olderThanMs?: number })`
  (default 24h, `DEFAULT_CART_ABANDON_MS`, also exported), which marks every open cart
  past its staleness threshold abandoned in one guarded `UPDATE` — idempotent on its own,
  same discipline as this package's other bulk sweeps.
  
  `cogenta serve` schedules it as a new `commerce-carts` task (hourly by default,
  `cartAbandonTickMs`/`cartAbandonAfterMs` test seams), always registered — like
  `commerce-subscriptions`, it needs no e-mail transport, only this site's own
  unconditionally-created commerce tables.
  
  No breaking change: `abandonInactive` is a new, additive method on `CartStore`.
- e01efae: T09-05 (audit 2026-09-01, partial) — account creation, password change and session
  revocation now write their audit entry directly at the point of mutation in
  `users-router.ts` (the same discipline fiche 61 task 1 already applied to
  `applyUserChange`/`bulkRoute`/`inviteRoute`/`anonymizeRoute`), instead of `cogenta
  serve` sniffing the HTTP path afterwards. `recordUserAudit`'s path-shape guesswork is
  removed rather than kept as a redundant second writer — a caller that reaches account
  creation, a password change or a session revoke through any future non-HTTP entry point
  now produces the same audit entry a browser request always did, which sniffing a URL
  could never guarantee. No route, request or response shape changes; `UsersRouterOptions`
  gains an optional `storeFor` (see the RGPD export changeset in this same wave).
  `api-keys-router.ts` and `role-permissions-router.ts` still use `cogenta serve`'s
  sniffing (`recordApiKeyAudit`/`recordRolePermissionAudit`) — left for a follow-up, out
  of this wave's budget.
- 5463fd0: Audit T-COM-01 (P0) — `cogenta serve` now actually bills subscriptions.
  
  `SubscriptionStore.runBilling`/`runDunning`/`sendRenewalNotices` (fiche 53 tasks 3 and
  5, `@cogenta/commerce`) had no caller anywhere in `cogenta serve`: a subscription whose
  renewal date came and went was never billed on a real site, a failed renewal payment was
  never retried, and a renewal reminder was never sent — despite all three being fully
  tested at `@cogenta/commerce`'s own level.
  
  `runServe` now registers a new `commerce-subscriptions` scheduled task (daily by
  default, overridable with the new `commerceBillingTickMs` test seam, same pattern as
  `commerce-order-emails`) that runs all three in sequence. Unlike the order-email task,
  this one is always registered — commerce tables and stores exist unconditionally
  (contract E, ADR-0024), and only `sendRenewalNotices` itself needs an e-mail transport
  to do anything, degrading to a safe no-op (R2) without one. `runServe` also now wires
  `createEmailRenewalNotifier` (`@cogenta/commerce`, already exported since fiche 53 but
  never called) as the subscription store's `notifyRenewal`, using the same degraded
  `FileEmailTransport`/real transport every other transactional sender in this file
  already has.
  
  A real bug was caught and fixed while wiring this in: the new task's interval override
  was missing from `scheduledTasksHeartbeatMs`'s `Math.min(...)` — the heartbeat itself is
  what actually drives every scheduled task, and forgetting an override there means the
  task's own `intervalMs` is irrelevant, since the heartbeat never runs often enough to
  notice it is due. A comment already on that line names this exact failure mode as
  something fiche 52's own commerce task once found and fixed for itself; T-COM-01 found
  it again for its own task, caught this time by a real end-to-end test (an overdue
  subscription billed within 5s of a 20ms tick) rather than a code read.
  
  No contract change: `runBilling`/`runDunning`/`sendRenewalNotices`/
  `createEmailRenewalNotifier` are all pre-existing `@cogenta/commerce` exports, unchanged
  by this patch.
- b3ce406: Fiche 61 task 1 — every account mutation now lands in the audit log, not just
  anonymization. `applyUserChange` (`users-router.ts`, shared by the single
  `PATCH /api/users/{id}` route and `POST /api/users/bulk`) now records a
  `user.update` entry, naming exactly which roles and/or status changed, for
  every account it actually mutates — a bulk action that used to leave no
  audit trail at all now writes one entry per account it touched, and none for
  an account it refused (the last-admin guard, an anonymized row). Resending
  or cancelling an invitation (`POST`/`DELETE /api/users/{id}/invite`) now
  records `user.invite_resend`/`user.invite_cancel`.
  
  `cogenta serve`'s `recordUserAudit` no longer re-derives a `user.update`
  entry by sniffing the HTTP path shape — that was the mechanism `/api/users/
  bulk` never matched in the first place, which is how bulk actions went
  unaudited. Single-account role/status changes are still recorded exactly
  once, now from inside the router that actually makes the change.
- 39d4be1: Fixes a real bug found while verifying the `saas` blueprint (L25): a routed
  entry page's `<title>`/`<h1>` fell back to the entry's raw id whenever its
  collection named its title field anything other than `title` — `vitrine`'s
  `service`, `restaurant`'s `menu_item`, `store`'s `product` and `saas`'s
  `feature` all use `name`. `theme-render.ts`'s own `entryTitle` now follows
  the same `title`/`name`/`label` fallback chain `@cogenta/theme-kit`'s
  `entryTitle` already used for cards and lists, so a feature page reads
  "Workflow automation" instead of a UUID.
- 33163e6: L25 Phase 1 — registers the new `@cogenta/theme-docs` package in the built-in theme
  registry (`theme-registry.ts`) and as a real npm dependency, so a site can select it from
  the Appearance screen and `cogenta serve`/`cogenta dev` can actually load it.
- 39d4be1: Registers `@cogenta/theme-saas` (L25) in the built-in theme registry
  (`theme-registry.ts`'s `BUILTIN_THEMES`) and adds it as a real dependency, so
  a site can select it from the Appearance screen and `saas`-blueprint sites
  activate it by default.
- 5d72083: Register `@cogenta/theme-restaurant` in `theme-registry.ts`'s `BUILTIN_THEMES` and as a
  declared dependency, so it is selectable from the admin's appearance screen alongside the
  other built-in themes, with no change to any existing site's active rendering.
- b60b198: Fixed the public icon still looking wrong after the earlier icon-only crop (`272b606`):
  the root cause was never the CSS size, it was the source pixels. That crop pulled the
  icon out of a combined icon+wordmark lockup, which left the hexagon mark occupying only
  a fraction of an already-small 64×64 canvas — no `block-size` on the `<img>` could fix
  that, since the mark itself was tiny inside its own image.
  
  `DEFAULT_LOGO_BASE64` (`packages/cli/src/commands/default-logo.ts`) now embeds a
  properly composed, generously padded icon-only source (`docs/logo/logo-cogenta-icon.png`
  and the matching admin/branding assets, all regenerated together) at 128×128 instead of
  64×64 — sharp enough for the 32–40px footer/login contexts that actually display it.
  Verified by `curl`, bypassing the browser cache, against the real served bytes.
- 3e22108: Audit fiche 05/15 (2026-09-01), correction A3 — `cogenta doctor` now
  reports on the two driver-backed needs it previously said nothing about:
  
  - **`images`**: which image transformer is active — `sharp` (optimal,
    native libvips) or the WebAssembly fallback (degraded) — the same
    driver-tier reporting `database`/`cache`/`storage`/`rateLimit` already
    get (rule R1, the `new-driver` skill's "doctor reporting" requirement).
    An operator on a host where `sharp` cannot install previously had no way
    to learn that short of a slow first media upload.
  - **`vector`** (L18 semantic search): reports the active vector store
    driver (`pgvector`/`file`/`memory`) the same way. A site with
    `vector.driver: 'pgvector'` pinned but no real Postgres connection now
    fails `doctor` with a named, actionable `DRIVER_UNAVAILABLE` problem
    instead of only surfacing the first time the assistant needs it; a site
    that leaves `vector` unconfigured reports no problem, since a
    service-free default (`file`, or `memory` as a last resort) always
    exists (R1).
  
  Also reports **image generation** (L18 task 4) as a note, when configured
  — the provider, model, and whether an API key is present in the
  environment — mirroring the existing LLM-provider note. This is a note
  rather than a `checks` entry: `createImageProviderRegistry` has no
  driver-tier/health concept (there is no service-free way to generate an
  image, R2's own reason this section has no default), unlike every real
  driver need above.
- e75b23e: Add global search: the ⌘K/Ctrl+K palette with shortcuts and "go to"/"create" actions, a full `/search?q=…` results page, highlighted excerpts, widened sources (orders, media, users, menus, extensions, taxonomy terms), typed inline filters (`status:draft`) and recent-search history (fiche 36).
  
  - `@cogenta/schema`'s search indexing (`extract.ts`) gains `buildExcerpt` — a window of prose
    around the first query term found, with match offsets scoped to that window, never the
    full text. Built from the *display* text (`SearchDocument.body`, never folded), so an
    excerpt keeps real casing and accents while still matching a folded, prefix-matching
    query.
  - `@cogenta/api`'s `search-router.ts` enriches each `SearchHit` with an excerpt built
    server-side, never reconstructed from HTML on the client (R3/R8: the excerpt is data,
    escaped at render).
  - `@cogenta/commerce`'s order store and admin router gain a search-by-number/email lookup,
    gated on the caller's own `commerce.read` permission — a source in the global search
    widens only what its own permission already allows, never more.
  - Admin: `shell/global-search.tsx` (palette, shortcuts, recent searches, inline-filter
    parsing), `routes/search.tsx` (the full results page, one tab per source with its own
    permission gate), `search/` (excerpt highlighting, inline-filter parser, recent-search
    `localStorage` store — never server-side, these are one person's own queries).
- 9bd3042: Fix: a `collectionList` block linking to an entry whose routed collection has
  no slug (a `slug`-kind field is not `required` by contract A — a draft
  published without one is real, reachable content) used to make `buildPath`
  throw straight through `renderPage`, turning one incomplete entry into a 500
  for every visitor of the page listing it. `link()` now degrades an
  unresolvable route to `href="#"`, the same fallback already used when the
  target was never fetched at all — one broken linked entry no longer takes
  down the whole page.
  
  Also: a refused `POST /api/auth/login` (wrong password or unknown account)
  is now journalled as `auth.login_failed` (actor `null`, attempted email kept
  on the entry), matching the intrusion-detection signal every other CMS's
  security tooling logs and that this audit trail was missing until now. Only
  the password step records this — TOTP, recovery-code and passkey completion
  reuse the same error codes for a different meaning each time, so recording
  those under the same generic action would misname what actually failed.
- 272b606: Fix: the default Cogenta mark served at `/_cogenta/logo-cogenta.png` (public
  site footer credit, and now the public site's favicon too) was a 64×64
  raster containing the icon *and* the "COGENTA" wordmark baked together —
  shrinking it to a footer-credit size made the text illegible and left the
  hexagon mark itself occupying only a fraction of an already-tiny canvas. No
  CSS `block-size` could fix that; the problem was in the source pixels. The
  asset is now cropped to the icon alone, trimmed and re-exported at the same
  64×64, with the full pixel budget spent on the mark instead of shared with
  text nothing at that size could read anyway. Also: the public site now
  serves a favicon (`<link rel="icon">`) — there wasn't one before.
- 68f5485: A public page whose collection opted out of comments, and that holds none, no longer ends
  on a "Comments (0) — comments are closed" section: closed and empty means there is no
  discussion on this page, not a discussion the visitor may not join. A closed thread that
  already holds approved comments still shows them read-only. `@cogenta/theme-saas` caps its
  feature grid at three columns so six features read as a 3×2 grid rather than four plus
  two orphans.
- fe789cf: Fiche L21 task 8 — Cogenta's own logo and credit, and a white-label override.
  
  Nothing branding-related existed before this: the admin's topbar carried a
  plain `//` text mark, and the public footer showed only the site's own name
  and its footer nav. `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a new
  `branding` group — `branding.showCogentaBranding` (boolean, `true` by
  default) and `branding.customLogoMediaId` (a media id, or unset) — persisted
  through the same generic key/value settings table every other editorial
  setting already uses, so no migration was needed for it.
  
  `@cogenta/cli`'s public theme render (`theme-render.ts`, both `renderPageChrome`
  and `renderEntryPage`) now renders a small branding block in the site
  footer: Cogenta's own logo and a link back to the project by default, the
  site's uploaded replacement once Cogenta's credit is turned off (served
  through the same public `/_image` endpoint every other image on the page
  already uses), or nothing once it's off with no replacement. Cogenta's own
  logo is served at a new, permanently cacheable `/_cogenta/logo-cogenta.png`
  route — a 64×64 PNG resized from the vendored source with the project's own
  WASM image driver (zero new dependency, R9/R10), the same degraded-tier
  codec `/_image` already relies on. Read live per request off the same
  settings store `reading.homePath` already reads, so turning branding off
  shows up on the very next page view, not the next restart — verified end to
  end (`test/serve-branding.test.ts`) on the home page, `/search`, and the
  page builder's own preview (whose fidelity test asserts its `<body>` stays
  byte-identical to the published page's — the branding block had to be wired
  identically on both paths for that to still hold).
  
  `@cogenta/theme-canonical`'s `base.css` gains the `.cg-site-footer__branding`
  rules the new markup needs.
- 86fc9cf: Fixed the media cache-busting bug audit 05-mediatheque §6 T02 found: replacing an
  uploaded file (`MediaStore.replace()`, fiche 11 task 4) has recorded a fresh
  `contentHash` since `theme@1.2`, and `RenderMediaAsset`/`MediaAsset.version` has existed
  on the type since then too — but `variantUrl()` never actually read it, and
  `loadRenderMedia()` (`cogenta serve`) never actually set it. The result: a replaced
  logo kept serving under the exact same `/_image?id=…` query string a year-long
  `Cache-Control: immutable` response had already cached, everywhere that image was
  already rendered.
  
  `@cogenta/render`'s `variantUrl()` now folds `media.version` into every candidate URL
  as `&v=` when present, unchanged (no `&v=`) when absent — fully backward compatible for
  a media entity built without this field. `@cogenta/cli`'s `loadRenderMedia()` now sets
  `version: asset.contentHash`, so `og:image`, JSON-LD's `image`, and every `srcset`
  candidate all change URL the moment a file is replaced, which is what actually protects
  a page a browser or CDN has already cached: an `immutable` response is never
  revalidated, so the origin's own stored bytes changing is not what breaks the cache —
  only the URL changing is.
  
  Also documents the `version` field on contract D's `MediaReference` (`docs/04-contrats.md`
  § Contrat D), additive to `theme@1.2`.
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
- 8c98093: Fix rich text (`richText` field) rendering when it carries a `media` node or an
  `internalLink` mark (ADR-0013): `cogenta serve` now resolves both before rendering, the
  same way it already did for a `collectionList` block's entries. Previously, an image
  placed inside a paragraph could make the whole page throw (`THEME_IMAGE_UNSUPPORTED`,
  the asset was never fetched), and an internal link inside prose always rendered a dead
  `<a href="#">` since its target was never looked up.
  
  An internal link whose target cannot be resolved — trashed, still a draft, or renamed
  away and gone — now renders as plain text instead of a dead anchor, on `@cogenta/theme-canonical`'s
  own recommendation for a stale link: never a 404, never a link to nowhere.
- 2299569: L20 audit, two real bugs in public-facing pages.
  
  **`/search` found nothing, even for words plainly on a freshly scaffolded
  site's own seeded demo content.** Every blueprint's `seedDemoContent`
  (`create-cogenta`) and `resetPlaygroundData`'s reseed write straight through
  `createContentStore`, never through the `withSearchIndexing`-wrapped store
  `cogenta serve` builds at startup — so the seeded rows existed in the content
  tables but never reached the search index table. Both now reindex every
  seeded collection against the site's real search index (`createSearchIndex` +
  `reindexAll`, the same pair `cogenta`'s own "Reindex search" tool uses)
  immediately after seeding, so the physical index and the content it describes
  are never out of step from the moment a site exists.
  
  **`/search` and `/forms/{name}` rendered with none of the site's visual
  chrome**, even though both already linked the site's stylesheet: they built
  their own thin `<html>` shell rather than the frame every collection page
  gets (skip link, `color-scheme` meta, header with primary nav, footer with
  footer nav) — the stylesheet loaded, but the markup its selectors target was
  never on the page. `@cogenta/cli` extracts that frame into a new
  `renderPageChrome` (`theme-render.ts`) and both pages now call it, menu
  wiring included. `renderFormPage`/`renderFormNotFoundPage` are now async and
  take an `AccessContext`, to match. The comment thread appended after an entry
  page shared the same gap — `@cogenta/theme-canonical`'s `base.css` gains the
  missing `.cg-search__*`, `.cg-form__*` and `.cg-comment__*` rules, at the same
  page-width measure `.cg-page__title` already sets.
- 07c0f0a: Fiche 57 (Compétences : dossiers de référence standard) — a skill's
  `references/`, `scripts/` and `assets/` sub-folders, the standard layout a
  real Claude Code/Anthropic skill uses, are now created automatically and
  manageable from the admin. No contract A/B/C/D touched; no ADR required
  (that would only apply to a future `skill.read_resource` tool, which this
  fiche deliberately does not add).
  
  **`@cogenta/agents`**: `AgentSkillStore` gains `listResources`,
  `addResource` and `removeResource`, plus the exported `SKILL_RESOURCE_DIRS`
  constant and `SkillResource`/`SkillResourceDir` types.
  `createFileAgentSkillStore`'s `create()` now also creates the three standard
  sub-folders, empty, alongside `SKILL.md`/`.meta.json`. Writing or removing a
  path outside `references/`, `scripts/` or `assets/` — or one that tries to
  escape the skill's own directory — is refused
  (`AGENT_SKILL_RESOURCE_INVALID`); a skill created before this fiche, with no
  sub-folders on disk, lists an empty resource set rather than erroring.
  
  **`@cogenta/core`**: two new error codes, `AGENT_SKILL_RESOURCE_INVALID` and
  `AGENT_SKILL_RESOURCE_UNKNOWN`.
  
  **`@cogenta/api`**: `agent-skills-router.ts` gains `GET`/`POST
  /api/agent-skills/:id/resources` and `DELETE
  /api/agent-skills/:id/resources/<path>`, all admin-only like the rest of the
  router. An upload accepts either a real `multipart/form-data` body (`path`
  field, `file` part — no base64 inflation for a binary asset) or a JSON body
  `{ path, content }` with `content` as plain UTF-8 text.
  `AgentSkillRegistryLike` gains the three matching methods; any other
  implementer of this interface needs to add them.
  
  **`@cogenta/cli`**: `agent-runtime.ts`'s `createSkillRegistryAdapter` wires
  the three new methods straight through to `AgentSkillStore` — no new CLI
  command or flag.
  
  **Admin** (not published, `@cogenta/admin`): the Compétences screen's edit
  row gains a "Fichiers de référence" panel — three lists (Références,
  Scripts, Gabarits) with upload and remove, using `FormData` uploads directly
  rather than the `fileToBase64` path `media-client.ts` still uses, since a
  resource file (an asset image, in particular) should not pay a ~33% base64
  inflation when a real `multipart/form-data` transport is already wired on
  the server side.
  
  Nothing here is loaded into an agent's context automatically — deliberately
  so, per the fiche's own warning against uncontrolled context growth (R7).
- 06d7c1d: Registers `@cogenta/theme-blog` in the built-in theme registry (`theme-registry.ts`)
  and as a real workspace dependency — selectable from the appearance screen's theme
  gallery and by `cogenta_theme.active_theme`, without a restart, exactly like the four
  existing built-in themes.
- Updated dependencies [1df80de]
- Updated dependencies [684d743]
- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [a2516aa]
- Updated dependencies [08e394b]
- Updated dependencies [d0a3250]
- Updated dependencies [0e88f30]
- Updated dependencies [750a10b]
- Updated dependencies [08e394b]
- Updated dependencies [deece35]
- Updated dependencies [edd0787]
- Updated dependencies [2c4de46]
- Updated dependencies [39d4be1]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [7d80741]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [8a13e08]
- Updated dependencies [0c7ecef]
- Updated dependencies [e01efae]
- Updated dependencies [36744d3]
- Updated dependencies [39807ed]
- Updated dependencies [b3ce406]
- Updated dependencies [4335296]
- Updated dependencies [722fc6b]
- Updated dependencies [ca9d74c]
- Updated dependencies [916ef34]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [2211d4b]
- Updated dependencies [c476861]
- Updated dependencies [7b7ec0b]
- Updated dependencies [7a59646]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [967ec5a]
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
- Updated dependencies [e75b23e]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [a15b1ae]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [c555723]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [0dceff3]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [dda55d6]
- Updated dependencies [befad6d]
- Updated dependencies [befad6d]
- Updated dependencies [befad6d]
- Updated dependencies [68f5485]
- Updated dependencies [a915e1a]
- Updated dependencies [4d3f3c7]
- Updated dependencies [e8061e2]
- Updated dependencies [fe789cf]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [77c680d]
- Updated dependencies [86fc9cf]
- Updated dependencies [3fb9e11]
- Updated dependencies [54409f3]
- Updated dependencies [f47e893]
- Updated dependencies [2285720]
- Updated dependencies [46572ba]
- Updated dependencies [a6530f6]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [4856972]
- Updated dependencies [dd9e9a2]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [8c98093]
- Updated dependencies [1995d35]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [1cdf7d7]
- Updated dependencies [745ebd8]
- Updated dependencies [2299569]
- Updated dependencies [4bb6ba3]
- Updated dependencies [960757d]
- Updated dependencies [2d84729]
- Updated dependencies [b50f7bb]
- Updated dependencies [8a8d873]
- Updated dependencies [835d736]
- Updated dependencies [cf005d4]
- Updated dependencies [07c0f0a]
- Updated dependencies [9e67928]
- Updated dependencies [06d7c1d]
- Updated dependencies [eb21099]
- Updated dependencies [70c7306]
- Updated dependencies [4f74c57]
- Updated dependencies [4335296]
- Updated dependencies [05f9e29]
- Updated dependencies [795ad62]
- Updated dependencies [5d72083]
- Updated dependencies [39d4be1]
- Updated dependencies [954460e]
- Updated dependencies [421cf33]
- Updated dependencies [3824e8e]
  - @cogenta/theme-saas@0.2.0
  - @cogenta/theme-blog@0.2.0
  - @cogenta/theme-restaurant@0.2.0
  - @cogenta/theme-association@0.2.0
  - @cogenta/theme-docs@0.2.0
  - @cogenta/theme-canonical@1.0.0
  - @cogenta/theme-ecommerce@1.0.0
  - @cogenta/theme-entreprise@1.0.0
  - @cogenta/theme-magazine@1.0.0
  - @cogenta/theme-portfolio@1.0.0
  - @cogenta/core@0.5.0
  - @cogenta/schema@0.4.0
  - @cogenta/api@2.0.0
  - @cogenta/agents@0.3.0
  - @cogenta/plugins@0.3.0
  - @cogenta/analytics@0.3.0
  - @cogenta/auth@0.4.0
  - @cogenta/commerce@0.3.0
  - @cogenta/blocks@1.0.0
  - @cogenta/theme-kit@0.2.0
  - @cogenta/channels@0.3.0
  - @cogenta/render@0.2.0
  - @cogenta/seo@0.3.0
  - @cogenta/comments@0.2.0
  - @cogenta/import@0.2.0
  - @cogenta/forms@0.2.0
  - @cogenta/export@0.2.0
  - @cogenta/observability@0.2.0
  - @cogenta/mcp@0.2.0

## 0.4.0

### Minor Changes

- [`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Self-hosted, cookie-free page-view analytics — the one CMS feature category
  the audit found completely missing. No third party, no cookie, no personal
  data ever stored, consistent with R1 (no dure dependency on external
  infrastructure) and the project's privacy stance.
  
  **New package `@cogenta/analytics`.** One table (`cogenta_analytics_events`):
  timestamp, page path, referring **domain only** (never the full referrer
  URL), a device category reduced from the User-Agent (`desktop`/`mobile`/
  `tablet`/`other`, never the raw string), and a **daily-salted session hash**
  — never an IP address, never a cookie. The salt (`cogenta_analytics_daily_salts`)
  is minted once per UTC day and rotates every day, so
  `sha256(salt|ip|device)` for the same real visitor is a *different*, unrelated
  value on every new day: nothing in the stored data can link two days of the
  same visitor's traffic, even with full database access, because reproducing
  yesterday's hash needs yesterday's IP, which was never written down. The IP
  address and the full User-Agent are used only as transient inputs to that
  hash and to the device classifier — neither is ever persisted. A dedicated
  privacy test suite (`test/privacy.test.ts`) inspects the actual stored
  columns, not just the public types, to prove this. `createAnalyticsStore`
  aggregates views by day, top pages, top referring domains and device
  breakdown; a same-session rate limit (60 events/minute) drops abusive
  traffic silently rather than erroring.
  
  **`@cogenta/core`** gains one error code, `ANALYTICS_SALT_UNAVAILABLE`
  (an internal race-recovery failure, not expected in normal operation).
  
  **`@cogenta/api`** gains `createAnalyticsRouter`: `GET /api/analytics/beacon`
  (public, records one event, always answers `204` even on a malformed or
  rate-limited request — a public collection endpoint must never break page
  rendering) and `GET /api/analytics/summary` (`admin`-only, `?days=` window).
  
  **`@cogenta/cli`** wires both into `cogenta serve` and injects the collection
  tag into every rendered page. The tag is an invisible `<img>` pixel, not a
  `<script>`: the theme's rendered output already carries a hard "zero
  executable client JavaScript" property (enforced by a `serve.test.ts`
  assertion), so a script reading `document.referrer` was not an option. The
  referrer is instead read **server-side**, from the `Referer` header of the
  request that is rendering the page, and baked straight into the pixel's URL
  — no client code needed to capture it. The page builder's live-preview
  render includes the same pixel (rather than omitting it) specifically to
  keep its `<body>` byte-identical to the published page's, the invariant
  `theme-render-fidelity` depends on.
  
  The admin gains a full `/analytics` dashboard (hand-built SVG bar chart, no
  charting dependency — R9) and a "views this week" widget on the main
  dashboard, both `admin`-only like every other traffic-shaped view in the
  admin.

- [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - API keys, wired to the transport (L13 task 8, companion to the
  `@cogenta/auth` changeset that adds the store).
  
  `resolveActor` now recognises two bearer-token shapes instead of one: a
  session (unchanged) and an API key, told apart by the key's `cogenta_sk_`
  prefix before any database lookup runs. A key resolves to an actor whose
  `roles` are exactly its granted `scope` — never more, and never derived from
  whoever created it — with an id prefixed `apikey:` so it can never collide
  with, or be mistaken for, a real user id in the audit log or a `me` route.
  Repeated attempts with an invalid key are rate-limited the same way a wrong
  password is, keyed on a hash of the attempted key since an unrecognised key
  carries no other identity to limit by.
  
  `@cogenta/api` gains `createApiKeysRouter` — `GET`/`POST /api/api-keys` and
  `DELETE /api/api-keys/{id}`, admin-only. The raw key is present in exactly
  one response body, `POST`'s, and never again: `list()` only ever returns the
  12-character prefix a key was minted with.
  
  `@cogenta/cli` mounts the router in `cogenta serve` under `/api/api-keys`
  and records `apikey.create`/`apikey.revoke` in the audit log, the same
  transport-boundary pattern `recordUserAudit` already uses — the raw key
  never reaches the audit entry, only the key's id.
  
  **The admin screen for managing keys lands in the same session**
  (`@cogenta/admin`, unpublished/private, no changeset needed) — a new
  `/api-keys` route, admin-only, that shows the raw key exactly once in a
  dismissable notice right after creation and never again afterwards.
  
  Compromise taken under time pressure, noted rather than hidden: scope is a
  flat list of role names rather than a collection-by-collection permission
  matrix. A key's actor is checked by the same `PermissionLayer` every other
  actor is, so a key can never do more than the roles it was granted allow —
  the simplification is in how finely a grant can be sliced, not in whether it
  is enforced.

- [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Completes the admin surface of contract E (ADR-0024) beyond its MVP: multiple
  variants per product, coupons, invoices and subscriptions are now all
  reachable from a real HTTP admin, not just the backend that already carried
  them.
  
  `@cogenta/commerce`'s `createCommerceAdminRouter` gains: `DELETE
  /variants/{id}` (a product's variant list was previously append-only from the
  admin's point of view); `GET`/`POST /coupons` and `POST
  /coupons/{code}/deactivate`; `GET`/`POST /subscriptions` and the
  `pause`/`resume`/`cancel` actions (absent when the caller does not wire a
  `SubscriptionStore` — a site with no `commerceSubscriptions` store answers
  404, never a crash); and `GET /orders/{id}/invoice` plus `GET
  /orders/{id}/invoice/pdf`, the read side of an invoice-issuing route that
  existed but could previously only be written to, never read back. The PDF
  route answers with a raw `Uint8Array` body — the one response in this router
  that is not JSON — and the Node transport (`cogenta serve`) now checks for
  that shape before deciding whether to `JSON.stringify` or stream bytes with
  `content-type: application/pdf`.
  
  `@cogenta/core` gains an optional `billing` config section (legal name,
  address, tax id, footer) — nothing here is a secret, rule R7 does not apply,
  a legal name is meant to be printed. Its absence is a real, first-class state:
  `cogenta serve` only builds an `InvoiceStore` and only accepts `POST
  /orders/{id}/invoice` once a site has filled this in, because an invoice with
  a made-up seller address is worse than no invoicing feature at all.
  
  `@cogenta/cli` wires `createSubscriptionStore` and the conditional
  `createInvoiceStore` into `assembleSite`, passes `coupons`/`subscriptions`/
  `invoices` into the admin router (previously only `catalog`/`orders`/
  `customers`/`payments` were threaded through, silently dropping the coupon
  store `cogenta serve` already built), and adds the PDF passthrough above.
  
  The admin (`@cogenta/admin`, private, no changeset) gets the screens this
  backend work makes possible: a real variant list per product (add, edit,
  remove, price and stock each independently, `commerce.catalog.write`-gated)
  replacing the one-variant-per-product MVP; `/commerce/coupons` (create by
  code/kind/value/validity window/redemption limit, deactivate); `/commerce/
  subscriptions` (list by status, cancel — creation is deliberately absent,
  since a subscription is created at checkout, not from the back office); and
  an "issue invoice" / download-PDF pair on the order detail screen. All money
  is entered and displayed through the existing `commerce/money.ts` conversion
  at the edges — every request on the wire still carries `priceMinor`, never a
  float.
  
  Proven end to end in `packages/cli/test/serve-commerce.test.ts`, against a
  real HTTP server and a real SQLite file: a second variant added and removed
  through the router; a coupon created, listed and deactivated, and refused for
  a role with only `commerce.read`; a paid order invoiced, the invoice read
  back by the same route the admin polls, and its PDF downloaded and checked
  for the format's own magic bytes (`%PDF-`) rather than merely a 200 status; a
  site with no `billing` configured answering `COMMERCE_INVOICE_NOT_FOUND`
  instead of issuing a document with a fabricated seller address; and a
  subscription seeded the way checkout would seed one, listed and cancelled
  through the real admin API.

- [`8e33d60`](https://github.com/cogenta-cms/cogenta/commit/8e33d60882a7194c1f329e8974d39575c1f45d3d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now mounts contract E's back office at `/api/commerce/*`.
  
  `@cogenta/commerce` had a complete, tested backend (products, variants, stock,
  carts, orders, payments, coupons, taxes, shipping) since L15, but its router
  was never actually reachable from a running site — the same "written, tested,
  never called" gap L10 closed for search, SEO, images and security. This
  closes it for commerce: `ensureCommerceTables` runs once at startup (a site
  that sells nothing pays only for a handful of idempotent `create table if not
  exists` statements it never queries), the catalogue/customer/order/payment
  stores are built the same way the taxonomy stores already are, and
  `createCommerceAdminRouter` is gated by contract E's own permission
  vocabulary (`commerce.read`, `commerce.catalog.write`, `commerce.order.write`,
  `commerce.payment.settle`, `commerce.order.refund`, `commerce.invoice.issue`)
  — never contract A's five actions, which do not stretch to "refund an order".
  
  The payment gateway wired in today is the manual/bank-transfer driver only
  (no provider keys required, so a shop is sellable out of the box); a site
  that wants Stripe configures it itself once `@cogenta/commerce`'s driver
  registry grows a way to do so from `cogenta.config`. Invoicing needed seller
  details this file had no source for — see the follow-up changeset that adds
  `cogenta.config`'s `billing` section and mounts it.
  
  Proven end to end in `packages/cli/test/serve-commerce.test.ts`: a real HTTP
  server, a real SQLite file, a real session — a product and its variant
  created through `/api/commerce` are immediately listable and carry the stock
  and price the write set.

- [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The other half of password reset (`.changeset/auth-password-reset.md`,
  L13 task 6): that changeset built the store and the terminal command and
  said plainly "no admin route can receive a reset click yet". This is that
  route, and the screen behind it.
  
  `@cogenta/auth`'s `AuthStore` gains a `resets` field — the
  `PasswordResetStore` `createPasswordResetStore` already built, now wired
  into the object every caller already holds, the same way `rateLimit` and
  `sessions` are.
  
  `@cogenta/api`'s `createAuthRouter` gains two routes. `POST
  /api/auth/forgot-password` accepts an email and answers with the **exact
  same response** whether or not an account exists for it — the line this
  route exists to never cross is account enumeration, and every branch of its
  handler (an existing account, a disabled one, a non-existent one) returns
  byte-identical bodies. It rate-limits by the submitted email, before the
  account lookup, on the same subject either way, the same posture
  `loginAttempts` already applies to a wrong password. Only a real, active
  account gets a token issued, delivered through a new optional
  `onForgotPassword` callback rather than a hard dependency on
  `@cogenta/channels` (R9) — the router itself never sends mail. `POST
  /api/auth/reset-password` redeems the token, sets the new password (same
  12-character floor as the self-service password-change route, now shared
  from a new `password-policy.ts` instead of duplicated), and revokes every
  existing session, exactly like `cogenta users reset-password --token`
  already does. A new error code, `AUTH_RESET_TOKEN_INVALID` (400), names an
  invalid, expired or already-used token — unlike `forgot-password`, this
  route's refusal is allowed to say why, since the secret here is the token
  itself, not whether an email exists.
  
  `@cogenta/cli` factors the mail-sending half of `cogenta users
  reset-password --email` out of `commands/users.ts` into a new shared
  `reset-mail.ts`, so `cogenta serve` can wire the identical wording (now with
  an optional link to the admin's reset screen instead of the terminal
  command) into `onForgotPassword` without a second copy of it. `runServe`
  passes it to `createAuthRouter` unconditionally: the token is still issued
  and thrown away unsent when no site's mail is configured to go anywhere
  useful, since the HTTP response must never depend on whether the mail could
  be delivered.
  
  `@cogenta/admin` (private, no changeset) gains the two screens this needed:
  "forgot password" on `/forgot-password`, linked from the sign-in screen, and
  "reset password" on `/reset-password?token=…`, the link the mail sends. Both
  are public routes, like `/login`. The user-management screen's role editor
  also moves off a raw comma-separated text field: four standard role names
  (`admin`/`editor`/`author`/`contributor`) are now offered as checkboxes,
  alongside any role a site's accounts already use, plus a free-text field for
  a role of the site's own — a UX convention only, not a contract A change
  (a role is still an arbitrary string as far as the server and the five
  permission actions are concerned).

- [`b61ff68`](https://github.com/cogenta-cms/cogenta/commit/b61ff68620644fbff48fb244178d1ad733035729) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Mounts L17's marketplace router (`@cogenta/api`'s `createMarketplaceRouter`,
  `@cogenta/plugins`' catalog and installer) into `cogenta serve` at
  `/api/marketplace/*`. Admin-only, same as every other route that installs or
  runs code. The catalog is local/embedded and empty by default — no site
  configures a distant registry yet, since that would need L13's API keys,
  which were never built.
  
  `@cogenta/cli` gains a new dependency on `@cogenta/plugins` (workspace).

- [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Navigation menus reach the public theme. `@cogenta/schema`'s menu store, `@cogenta/api`'s
  `createMenuRouter` and the admin's `/menus` screen were complete and tested (see the
  `menus-navigation` changeset), but nothing ever rendered one — the changeset that added
  them named the exact gap and where to close it, and this closes it.
  
  Convention (undeclared by contract A or D — navigation is not content, and `Base.astro`'s
  real header/footer slots are not reachable from `cogenta serve`'s render pipeline, which
  builds its own minimal frame): a menu named `main` renders in the header, one named
  `footer` renders in the footer. Neither existing is unchanged behaviour — the same empty
  slots as before this was wired.
  
  Rendering is a flat list of links (the documented MVP): every item of the menu, in the
  order the store returns them, regardless of `parent`/`depth`. The hierarchy the store
  already carries is not thrown away — a real sub-menu render only needs a new
  `renderMenuLinks`, not a data change — it is simply not built yet, for time.
  
  The lookup itself is `GET /api/menus/by-name/{name}` called in-process through the exact
  same `MenuRouter` `/api/menus/*` is mounted with (`RestRequest` in, `RestResponse` out) —
  never a second lookup path, and never a real HTTP round trip to itself.

- [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Navigation menus, missing entirely until now — no backend, no admin, no theme wiring — and
  a P0 gap for a CMS meant to compete with WordPress/Strapi/Drupal.
  
  `@cogenta/schema` gains `createMenuStore`/`ensureMenuTables`: a menu is a named tree of
  items (`entry` — a link to a real collection entry, `url` — an external link, or
  `submenu-placeholder` — a heading with no target of its own), structurally close to a
  taxonomy term tree (materialised path, reusing `taxonomy-path.ts`'s helpers as-is) but
  **not** a `TaxonomyStore`: a menu is created and edited entirely at runtime from the admin,
  never declared in a site's schema module, so it gets one fixed pair of tables
  (`cogenta_menus`/`cogenta_menu_items`) rather than one table per declared name. A menu
  belongs to a locale the same way a localised collection does (ADR-0014) — two menus named
  `main` can coexist, one per locale, never one row trying to carry both. New error codes:
  `MENU_UNKNOWN`, `MENU_NAME_TAKEN`, `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_INVALID`,
  `MENU_CYCLE`.
  
  **One real bug found and fixed while building this**: a materialised path is id-based, so
  two siblings' paths diverge at their own id — sorting a listing by `path asc, position asc`
  (`taxonomy-store.ts`'s own pattern) therefore sorts siblings by *creation order*, never by
  `position`, silently defeating any "move up/down" a caller might build on top of it. The
  menu store walks the tree in application code instead (group by parent, sort each group by
  `position`, depth-first from the roots) — cheap for something the size of a navigation
  menu, and it is what makes `reorderItem` (swap with the sibling before/after) actually work.
  
  `@cogenta/api` gains `createMenuRouter`: `GET /api/menus` and `GET /api/menus/{id}` are
  public (a menu serves the public theme's navigation, same as a published entry); every
  write requires `admin` or `editor` — a fixed rule, not a per-site permission
  configuration, since a menu is neither a collection nor a taxonomy and giving it a third
  `PermissionLayer` method for one rule that never varies would be new surface for nothing.
  `GET /api/menus/by-name/{name}?locale=` resolves a menu the way a theme will want to
  (refusing ambiguity across locales without `?locale=`, rather than guessing). An `entry`
  item is optionally resolved to a display label and public route via an injected
  `resolveEntry` callback, kept out of the router itself so it stays decoupled from content
  resolution.
  
  `cogenta serve` mounts `/api/menus/*`, resolving `entry` items through the same
  permission-checked `ContentGateway` and `buildPath` the theme renderer uses, as `ANONYMOUS`
  (a menu is public navigation — an item never resolves to more than an anonymous visitor
  could see). The admin gains a `/menus` screen (menu selector, item list with up/down
  reorder buttons and delete, add-item form for a URL or a collection+entry), kept plain like
  `taxonomies.tsx` — L11 owns how the admin looks; every action goes through the real API and
  write controls only render for `admin`/`editor` (the server refuses the rest regardless,
  R4).
  
  **What is not done, and why**: theme rendering (a public page actually showing a menu) is
  out of scope for this change — see `BLOCKERS.md` for the exact point to wire it in
  (`packages/theme-canonical/src/Base.astro`'s header/footer slots, fed by
  `GET /api/menus/by-name/{name}`). Nothing here touches contract A or B: a menu is
  deliberately not content and not a block.

- [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give the redirect table, HTTP security and outbound webhooks a real admin
  screen (audit follow-up to L10 tasks 2/6 and L14 task 1)
  
  Three backend pieces existed and were fully wired into `cogenta serve` with
  no way to reach them from a browser.
  
  - `@cogenta/core` gains the `REDIRECT_UNKNOWN` error code, for a `DELETE` on a
    redirect that does not exist.
  - `@cogenta/api` gains `createRedirectRouter` (`GET`/`POST`/`DELETE
    /api/redirects`) and `createOpsStatusRouter` (`GET /api/security-status`,
    `GET /api/webhooks-status`). Both are admin-only on every method, including
    `GET`: a redirect table and a site's CORS/CSP/HSTS configuration are
    routing and hardening decisions, not content, so neither has a reader role
    the way a taxonomy or a menu does. Loop and self-redirect refusal is
    entirely `RedirectStore`'s own job (`CONTENT_REDIRECT_LOOP`,
    `CONTENT_ROUTE_INVALID`), surfaced here as a proper 409/400 instead of a
    500.
  - `cogenta serve` mounts all three at `/api/redirects`, `/api/security-status`
    and `/api/webhooks-status`, and `@cogenta/admin` gains three screens:
    `/redirects` (full CRUD) and `/ops-settings` (`security` and `webhooks`,
    **read-only**).
  
  The security and webhooks screens are read-only by design, not by omission.
  Both settings live in the site's `cogenta.config.mjs` — versioned in git,
  deployed with the code that depends on it (a CSP that allows a script host
  has to travel with the deploy that added the script). Letting the admin edit
  them would create a second source of truth that disagrees with the file the
  moment either one changes without the other, which is a bigger architecture
  change than this audit's scope. The screens instead mirror exactly what the
  running process is enforcing on every request.
  
  No delivery history is shown for webhooks: none is persisted anywhere today
  (`WebhookEventSender.send` only ever returns a per-call result to log). The
  screen says so rather than inventing one.

- [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Scheduled publication, written and tested since L1 (`@cogenta/schema`'s
  `schedulePublication`/`registerScheduledPublishing`, a `QueueDriver`-based mechanism with
  a real degraded `database` driver) but never wired to anything: an editor could set an
  entry to "Scheduled" with a future date and nothing would ever happen — the admin showed
  it as a read-only badge, honest about the gap rather than lying about it.
  
  **The missing link was the write path, not the queue.** `ContentStore.update()` never
  changes `status` (contract A keeps that transition to `publish`/`unpublish`), so there was
  no way to move an *existing* entry into `scheduled` at all — only `create({status:
  'scheduled', ...})` worked. `unpublish()` now also accepts `status: 'scheduled'` with a
  required `publishedAt` (a `Date`, an ISO string, or epoch milliseconds), writing it as an
  ordinary value of the collection's own `publishedAt` field the same way `publish()`
  already does. A collection that never declared `publishedAt` refuses with
  `CONTENT_SCHEDULE_INVALID` rather than accepting a schedule with nowhere to put the date.
  
  `@cogenta/schema` gains `withScheduledPublishEnqueue`, a `ContentStore` decorator in the
  same family as `withSearchIndexing`/`withLifecycleEvents`: wrapping `create`/`update`/
  `unpublish`/`restore`, it calls `schedulePublication` whenever the result is
  `status: 'scheduled'`. It re-enqueues on every save rather than tracking a previous job
  id — safe, because the handler re-reads the entry before publishing and skips anything no
  longer `scheduled` (an edit back to `draft`, or a manual publish that already happened).
  
  `@cogenta/api`'s `POST /{collection}/{id}/unpublish` accepts
  `{"status": "scheduled", "publishedAt": "…"}` alongside the existing `draft`/`archived`.
  
  `cogenta serve` creates a `database`-backed `QueueDriver` per site (R1: no external
  worker, no Redis — a table in the site's own database, drained in-process) and registers
  the publish handler once, at `assembleSite`. `runServe` drains it on a `setInterval` —
  once immediately at startup to catch up on anything overdue, then every 60 seconds for as
  long as the process runs. The trade this makes, and the one worth knowing: a page
  scheduled for 09:00 goes live between 09:00 and 09:01, and if the process is down when
  09:00 comes, nothing is lost — the job is still in the table — it simply runs late, on
  the first tick after the next start.
  
  Not a CLI flag: `ServeOptions.scheduledPublishTickMs` overrides the cadence for tests
  only (proving the loop really drains the queue without waiting a real minute for it); an
  operator has no reason to touch it.
  
  The admin's status control gains a real `datetime-local` picker (never free text),
  offered whenever the collection declares `publishedAt`: "Programmer"/"Reprogrammer" call
  the new `unpublish` shape, and "Annuler la programmation" moves a scheduled entry back to
  draft.

- [`71e1dcd`](https://github.com/cogenta-cms/cogenta/commit/71e1dcd3f8204dca3b05cfd8558e7cf39aedc9e8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - WordPress import from the admin, not only `cogenta import wordpress` on a
  terminal. `@cogenta/api` gains `createImportRouter` (`POST
  /api/import/wordpress`), and `cogenta serve` mounts it — admin-only, checked
  before the (potentially multi-megabyte) upload body is even read, the same
  defensive order `/api/site-plans` already uses for the same reason.
  
  The import logic itself is not duplicated: the router takes an injected
  `runWordPressImport` function, and `cogenta serve` wires it to
  `@cogenta/import`'s real `importWordPress`, unchanged — `@cogenta/api` gains
  no new dependency, the same shape rule `MediaRouterOptions.images` already
  follows. A successful import is recorded in the audit log
  (`import.wordpress`) with the counts, never the document itself.
  
  The admin gets a screen at `/import`: choose a WordPress "Export All Content"
  file, and see the same report `cogenta import wordpress` already prints — what
  was imported, what was skipped, and what could not be converted to a block.

### Patch Changes

- Updated dependencies [[`fa3d13b`](https://github.com/cogenta-cms/cogenta/commit/fa3d13beb1d7394010dcb77e6bab0efbb07e3f6d), [`3b04c56`](https://github.com/cogenta-cms/cogenta/commit/3b04c56ca17291732a1e3f61cfa3b07248708a19), [`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944), [`71e1dcd`](https://github.com/cogenta-cms/cogenta/commit/71e1dcd3f8204dca3b05cfd8558e7cf39aedc9e8)]:
  - @cogenta/api@1.1.0
  - @cogenta/analytics@0.2.0
  - @cogenta/core@0.4.0
  - @cogenta/auth@0.3.0
  - @cogenta/commerce@0.2.0
  - @cogenta/plugins@0.2.0
  - @cogenta/schema@0.3.0
  - @cogenta/agents@0.2.1
  - @cogenta/blocks@0.1.4
  - @cogenta/channels@0.2.1
  - @cogenta/import@0.1.4
  - @cogenta/render@0.1.4
  - @cogenta/seo@0.2.1
  - @cogenta/theme-canonical@0.2.1

## 0.3.0

### Minor Changes

- [`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Advanced AI (L18): a writing assistant, a `vector` driver, semantic search,
  RAG chat with citations, classification/duplicate detection/moderation, and
  FAQ/Schema.org drafting. **Nothing here is on a required path** — a site with
  no AI provider configured behaves exactly as before, and the whole feature set
  disappears from the UI rather than failing (R2).
  
  - **`@cogenta/agents`** gains the `vector` driver need the architecture
    document has named since L0 and nothing implemented: `VectorStore` with three
    drivers behind the existing `createDriverRegistry` — `pgvector` (optimal),
    `file` (degraded, survives a restart) and `memory` (degraded, always
    available). One contract suite runs against all three; pgvector's run is an
    integration test that skips loudly without `COGENTA_TEST_POSTGRES_URL`.
    Nothing re-implements cosine similarity: L4's `vectorRank` does the ranking
    everywhere, and all three drivers return the same number.
  
    `createSemanticSearch` fuses the vector half with L10's full-text index by
    RRF — **beside it, never instead of it**: pure vector search misses
    exact-keyword queries, which is the failure the architecture document warns
    about at line 190.
  
    Fifteen Contract C tools, all `sideEffects: false`, every output carrying
    `applied: false` as a **literal** so an assistant tool's type cannot say it
    changed anything (R6). Eight writing tools (rewrite, proofread, summarise,
    translate, meta description, titles, tags, alt text), `assist.generate_image`
    behind a two-vendor image provider driver (OpenAI, Stability), `assist.chat`
    (RAG with citations), `assist.classify`/`assist.find_duplicates`/
    `assist.moderate`, and `assist.faq_draft`/`assist.schema_org_draft`.
  
    Three properties worth knowing:
    - **Citations come from retrieval, not from the model.** The model names
      1-based indices into the passages it was shown; this code maps them back to
      what the retriever returned, and an invented index resolves to nothing. A
      chat answer can never cite a page that was not retrieved.
    - **Moderation and duplicate detection can recommend `none` or `review`, and
      nothing else.** The union has no destructive member, so no answer —
      however jailbroken — describes a deletion.
    - **`assist.find_duplicates` needs no AI provider at all.** It embeds with
      the site's `EmbeddingProvider`, which by default is the local hashing one:
      no key, no service, no model download.
  
  - **`@cogenta/core`** gains an `imageGeneration` config section
    (`COGENTA_IMAGE_PROVIDER`/`_MODEL`/`_BASE_URL`, key in `COGENTA_IMAGE_API_KEY`
    and refused in the config file like every other secret), a `vector` section
    (`driver`/`path`/`table` — dimensions stay on `embeddings`, never duplicated),
    and the error codes `VECTOR_DIMENSION_MISMATCH`, `VECTOR_STORE_FAILED`,
    `ASSIST_UNAVAILABLE`, `ASSIST_RESPONSE_INVALID`.
  
  - **`@cogenta/api`** gains `createAssistantRouter` — `GET /api/assistant` and
    `POST /api/assistant/run`. The `GET` answers **200 with
    `{available: false, tools: []}`** on a site with no provider, which is what
    lets a client render nothing instead of handling an error. The permission
    gate is the route's, not the tools' (R4): an actor may use the assistant when
    they may edit content somewhere, and an anonymous caller is refused before any
    provider is contacted, so an unauthenticated request can never spend the
    site's AI budget. The route also refuses any tool declaring a side effect,
    even though none does.
  
  - **`@cogenta/cli`** wires all of it into `cogenta serve`: providers built from
    the config, the vector store selected through the registry, the content stores
    wrapped so a publish updates the embedding index the same way it already
    updates the full-text one, and `/api/assistant` mounted on every site. Every
    piece degrades to "off" with a log line rather than stopping the site: an
    unknown provider name, a missing API key, an unavailable vector store and an
    embeddings provider with no adapter yet are four warnings, not four crashes.
  
  **Migration**: none. Every new configuration section is optional, and a site
  that adds none behaves exactly as it did before.

- [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Password reset, absent until now (L13 task 6). A person who forgot their
  password had no way back: `users create` was the only account command, so
  the recovery procedure was "have an administrator make you a second
  account".
  
  `@cogenta/auth` gains `createPasswordResetStore`, backed by a new
  `cogenta_password_resets` table that `ensureAuthTables` creates like the
  others. A token is 32 random bytes stored only as a SHA-256 hash — a leaked
  table hands out nothing live, the same posture as a session token — bound to
  one user, valid 30 minutes, and usable exactly once. Single use is enforced
  by `update ... where used_at is null` reporting `rowsAffected`, so two
  simultaneous redemptions produce one `ready` and one `used`, not two
  successes. Issuing a second reset deletes the first: a person who asks again
  because the mail never arrived must not leave two working links behind.
  
  The token is deliberately **not** a signed payload. A signature can be
  checked without touching the database, and that is precisely what must not
  happen — single use and revocation are properties of a row, and an
  already-used token still carries a perfectly valid signature.
  
  `@cogenta/cli` gains `cogenta users reset-password`, in two halves:
  `--email <address>` issues a token and mails it; `--token <token>
  [--password <text>]` redeems it, replaces the password, and revokes every
  session the user had. That last step is why the CLI composes the stores
  rather than calling one: a reset that leaves whoever knew the old password
  signed in has reset nothing.
  
  The mail goes through `@cogenta/channels`'s existing email adapter — a new
  workspace dependency of `@cogenta/cli`, and the project's one way out for
  mail rather than a second mailer. Its only transport is the local file one
  (a real SMTP transport remains a documented gap in that package), so the
  command writes a real message to `.cogenta/mail` and says so in as many
  words instead of pretending anything was posted. Because the token never
  appears on the terminal, the mail is the only place it exists.
  
  Since no admin route can receive a reset click yet (that lands with L11),
  the message carries the token and the exact command rather than a link that
  would 404 today.

- [`1c9b114`](https://github.com/cogenta-cms/cogenta/commit/1c9b114d7bde96ea00e8f75b75129f109e5c34ae) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Render an unsaved draft through the real page pipeline, so the visual page builder can
  show the published page instead of a lookalike.
  
  `theme-render.ts` gains `renderDraftPage(draft, options, context)`. It reads the stored
  entry through the same permission-checked `ContentGateway` as everything else, overlays
  the block list and values the editor has on screen but has not saved, resolves the entry's
  real path with the same `buildPath` the public route uses, and hands all of it to the one
  page renderer `renderRequestedPage` already used. There is no second renderer: both
  exports now differ only in how they got hold of an entry.
  
  `cogenta serve` exposes it as `POST /api/builder/render`, behind three gates in order — an
  authenticated actor, `update` on the collection asked of the same `PermissionLayer` every
  write path asks, and the gateway's own read check inside the render. A refusal answers 403
  through `errorResponse`, not 500. The response is `no-store`: a draft is cacheable by
  nobody.
  
  `Site` now carries `permissions`, so a route this file serves itself can ask the one
  authority rather than re-deciding who may edit.
  
  **What the fidelity test found.** The preview's `<body>` is byte-for-byte the public
  page's — asserted, not assumed. Its `<head>` is not, and should not be: a preview reads the
  *working* face of the entry, so `@cogenta/seo` refuses it `isPublished` and the document
  carries `noindex, nofollow` and drops the canonical link. The test asserts the difference
  is exactly those two tags and nothing else, which is a stronger statement than equality
  would have been.

- [`45d2815`](https://github.com/cogenta-cms/cogenta/commit/45d281560017abde1a069b01458a709293c1613b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now serves a real SEO surface instead of a bare `<title>`
  (L10 tasks 1-2). `@cogenta/seo` existed, was tested and was imported by
  nothing; it is now wired to the running server.
  
  Every rendered page carries a title, a meta description, a canonical URL,
  `hreflang` alternates for its linked translations (ADR-0014), Open Graph
  and Twitter Card tags, and a JSON-LD block — all derived from the real
  entry and the real collection through `buildMetaTags`/`buildJsonLd`, never
  hand-written here. An unpublished entry rendered through a preview token
  still carries `noindex`, because the gate is the package's own.
  
  Three new routes, all built from the live content:
  
  - `GET /sitemap.xml` (and `/sitemap-N.xml` once a site outgrows the
    50 000-URL protocol limit), listing published, routed entries only.
  - `GET /robots.txt`, naming the sitemap and keeping crawlers out of
    `/admin` and `/api/`.
  - The redirect table is applied to **every** public GET before route
    matching, so a page renamed last month answers its old URL with the 301
    the rename recorded, query string preserved. It was previously reachable
    only through `/api/content/-/by-path`, which a browser never calls.
  
  `hreflang` lookup is skipped entirely on a single-locale site, so a
  monolingual install pays nothing for it.

- [`ad18e0e`](https://github.com/cogenta-cms/cogenta/commit/ad18e0ed335d06ad861958e74bbfd2318e2509b8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Images are processed at upload and served with a real `srcset` (L10 task 5).
  `@cogenta/render`'s image pipeline, `srcset.ts` and its two driver tiers
  (sharp, WebAssembly libvips) had existed since L3 and were called by nothing:
  an uploaded image recorded no dimensions, produced no renditions, and
  `ctx.image()` in the rendered page threw `THEME_IMAGE_UNSUPPORTED`.
  
  - **`@cogenta/api`** — `createMediaRouter` takes an optional
    `MediaImageProcessor`. On an image upload it probes the intrinsic size into
    the asset's existing `width`/`height` columns (no schema change) and writes
    the renditions beside the original under `media/{id}/variants/`. Deleting
    the asset deletes them, by recomputing their names — `StorageDriver` has no
    `list`, which is why the ladder is fixed and `variantNames` exists. The
    interface is injected rather than imported: a REST transport has no business
    pulling a 12 MB WebAssembly dependency into its tree.
  - **`@cogenta/cli`** — builds that processor from the real driver registry and
    serves the renditions at a new **public** `GET /_image?id=…&w=…`. Public and
    image-only on purpose: a published page's `<img>` is fetched by a browser
    with no session, so it cannot sit behind the same gate as
    `/api/media/{id}/file`, which is unchanged and still covers every other kind.
    `/_image` never renders on demand — an unstored width falls back to the
    original — so a public URL cannot be turned into CPU.
  - The rendered page now carries a real `srcset`, and `og:image` and JSON-LD's
    `image` come from the same asset, absolute. Which media a page needs is
    answered by `collectDependencies`, the walk `/api/content` already uses,
    rather than by a new heuristic over block JSON.
  
  Variants are produced at upload rather than lazily because `cogenta serve`
  has no durable variant cache: a lazy pipeline behind an in-memory store
  re-decodes every image after every restart, which is the worst answer on the
  shared hosting R10 names. WebP only, for now, because AVIF's encode cost on
  the WASM tier — the tier that always exists — would make an upload of a
  handful of images take minutes.
  
  Also fixes a real shutdown hang: `server.close()` waits for every open
  connection, so one client that fetched a large response and never read the
  body kept `cogenta serve` alive forever. Shutdown now cuts remaining
  connections after a short grace period.

- [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Detect broken links across published content (L14 task 3)
  
  `@cogenta/schema` gains `extractLinks` and `checkLinks`, and `@cogenta/cli`
  gains `cogenta links check` to run them over a real site.
  
  The crawl walks every published entry, collects every link it holds — a
  rich-text `markDefs` href, a contract B action `target`, a plain `url` field —
  and reports the ones that lead nowhere, telling apart a target that was
  deleted, one that exists but is not published, a path no route can serve, and
  a reference to a collection the site does not have. Each distinct target is
  resolved once however many entries point at it.
  
  Two deliberate limits, both documented in the code:
  
  - **External URLs are opt-in** (`--external` / `checkExternal`). A HEAD that
    comes back 403 or 405 is retried as a GET, because plenty of hosts refuse
    HEAD on pages they serve happily.
  - **Nothing schedules itself.** Rule R1 guarantees no durable worker, so
    "periodically" is a cron entry calling the command, not a scheduler
    pretending to exist inside the site. `cogenta links check` exits 1 when it
    finds something, so it works as a CI or cron check.
  
  Note: the full-text index is not reused for this, as the lot suggested it
  might be — `search/extract.ts` deliberately strips `href`, `url` and
  `markDefs` before indexing, so it holds no URL at all.

- [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Send a real signed webhook when content is published (L14 task 1)
  
  The signed outbound webhook channel has existed since L6 and nothing ever
  called it. It is now connected to the content lifecycle.
  
  - `@cogenta/channels` gains `createWebhookEventSender`, which POSTs a
    structured `{ event, occurredAt, data }` envelope to every configured
    endpoint. It reuses `signOutgoingWebhook` and the existing
    `X-Cogenta-Timestamp` / `X-Cogenta-Signature` headers **verbatim**, so a
    receiver verifies an event with `verifyIncomingWebhook` exactly as it
    verifies a message — there is no second signing path. It never throws: a
    failed delivery comes back as a result to log, so an editor's publish is
    never lost to somebody else's downtime.
  - `@cogenta/schema` gains `withLifecycleEvents`, a `ContentStore` decorator in
    the same shape as `withSearchIndexing`. It emits `content.publish` (from
    `publish()`, and from `create()` with a published status),
    `content.unpublish` and `content.delete`, each carrying the entry's
    identity, status, timestamps and its real route path from `buildPath`.
    Draft edits emit nothing. The event body never carries the content itself.
  - `@cogenta/core` gains a `webhooks.endpoints` config section. The signing
    secret is environment-only (`COGENTA_WEBHOOK_SECRET`, rule R7); endpoints
    configured without it disable delivery with a startup warning rather than
    falling back to unsigned requests.
  - `cogenta serve` wires the two together, outermost of all store decorators so
    an event only describes a write that really landed.
  
  Proven end to end by a suite that publishes over real HTTP and verifies the
  signature on the bytes a real `node:http` receiver got off the socket.

- [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Serve a site's own page for an unmatched URL (L14 task 2)
  
  `cogenta serve` answered every unmatched public URL with a bare JSON error.
  It now renders the site's own 404 page instead, with a real 404 status.
  
  The 404 body is an ordinary published entry at `site.notFoundPath` (`/404` by
  default, overridable in `cogenta.config` or via `COGENTA_SITE_NOT_FOUND_PATH`)
  — editable in the admin like any other page, and rendered by exactly the same
  function, through exactly the same permission-checked gateway, as every other
  page. So a draft 404 page is not shown to the public, and a site that has not
  written one still gets the plain refusal it got before. The lookup happens at
  most once per request: the 404 path itself is never re-resolved.

- [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Surface repeated failed sign-ins instead of only slowing them down (L14 task 4)
  
  `cogenta_login_attempts` has been written to on every failed sign-in since L2
  and read by nothing but the rate limiter's own counter. A site being
  brute-forced knew it and told nobody. It now says so, in two places.
  
  - `@cogenta/auth`'s `RateLimiter` gains `recentFailures()`, which groups the
    attempts still inside the backoff window by subject, worst first. It also
    **prunes** what has fallen out of the window — a real leak, since `clear()`
    only runs after a *successful* sign-in, so a subject that never succeeds
    accumulated rows for ever, which is exactly the case that grows fastest.
  - `@cogenta/api` gains `createSuspiciousActivitySource`, one more `NoticeSource`
    in the array `serve.ts` already builds. It shows an admin — and only an
    admin — how many failures across how many accounts, and is not dismissible
    because it disappears on its own within the limiter's fifteen-minute window.
  - `cogenta serve` also sends a `security.suspicious_activity` alert through the
    signed webhook channel L14 task 1 connected, built with `@cogenta/channels`'s
    own `buildAlert` — no second notification path and no second signature. At
    most one alert per five minutes, so a script making hundreds of attempts does
    not become hundreds of outbound requests.
  
  **Counts only, never the accounts.** Neither the notice nor the outbound alert
  names an email: that would turn an admin screen into an account-enumeration
  surface, and the numbers are what a decision is made on. Per-subject detail
  stays in the audit log, behind its own permission.
  
  The rate limiter itself was audited before anything was added and needed
  nothing: password sign-in, TOTP sign-in and TOTP enrolment all go through it,
  WebAuthn is deliberately exempt (there is no guessable secret), and password
  reset has no HTTP route at all.

- [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - MFA is no longer a gate at sign-in, and the admin gains a generic notices
  mechanism that recommends it instead (ADR-0021).
  
  **Breaking for anyone driving the auth API directly**, although both packages are
  still pre-1.0 and this is released as a minor:
  
  - `LoginResult` has two members, not three. `totp_setup_required` is gone.
    `passwordLogin` now issues a session for any role that has no second factor
    enrolled — including `admin` — and challenges only an account that actually
    enrolled one. Previously a role that could `publish` on any collection, and
    `admin` unconditionally, was refused a session until it completed a TOTP
    ceremony, which meant the first admin of a brand-new site could not reach a
    single screen without an authenticator app to hand.
  - An unconfirmed TOTP secret no longer counts as a factor. Someone who opened
    the enrolment screen and walked away used to be challenged for a code their
    authenticator app had never received, with no way back.
  - `AuthService.beginTotpSetup(ticket)` / `confirmTotpSetup(ticket, code)` are
    replaced by `beginTotpEnrolment(userId)`, `confirmTotpEnrolment(userId, code)`
    and `disableTotp(userId)`. Enrolment is self-service from an existing session
    rather than a step in the sign-in flow.
  - `POST /api/auth/totp-setup` and `POST /api/auth/totp-setup-confirm` are
    replaced by `POST /api/auth/totp/enrol`, `POST /api/auth/totp/enrol/confirm`
    and `DELETE /api/auth/totp`. All three require a session, and the account they
    touch is the one the bearer token resolves to — no route takes a user id, so
    no request shape can enrol or disable a factor on somebody else's account.
  
  `requiresMfa()` and `sensitiveRoles()` are unchanged and still exported. They now
  answer "who is shown the recommendation" instead of "who is blocked".
  
  New in `@cogenta/api`: `createNoticeRouter`, `createNoticeDismissalStore` and
  `createMfaRecommendationSource` — a generic admin-notice mechanism serving
  `GET /api/notices` and `POST /api/notices/{id}/dismiss`. Notices are per-account,
  persist until the thing they report is fixed or the person dismisses them, and
  carry a stable code plus substitutions rather than prose, so the admin translates
  them. A dismissal is stored server-side (new table `cogenta_notice_dismissals`,
  created on startup), so the answer follows an account across browsers instead of
  living in one `localStorage`. Adding a future recommendation is one more
  `NoticeSource` in an array, with no change to the router, the store or the admin.
  
  `cogenta serve` mounts `/api/notices` and registers the MFA recommendation.

- [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Full-text search is reachable for the first time (L10 task 3). The engine
  (`packages/schema/src/search/`, one driver per database) has existed and
  been tested since L1, but nothing anywhere in the repository ever called
  `index()` and no route ever called `search()` — so every search returned
  nothing, however the query was written.
  
  - **`@cogenta/schema`** gains `withSearchIndexing(store, { collection,
    index, onError })`, a `ContentStore` decorator in the same shape as
    `withReadOnlyStore`. Wrapping the store rather than hooking a router is
    what makes REST and GraphQL both covered by one guard instead of two.
    Its central safety property: after any mutation the **published** face is
    read back first and indexed when it exists, so an unpublished edit to a
    published entry can never be filed under a status a public search reaches.
    A failing index write never fails the content write — the index is derived
    data — and surfaces through `onError` rather than silently.
  - **`@cogenta/api`** gains `createSearchRouter` — `GET /api/search?q=…`,
    with `collections`, `status`, `locale`, `limit` and `offset`. Naming a
    collection you may not read is a 403, not a quieter answer; the default
    scope is the readable collections only, and every hit is filtered against
    that same set on the way out. `status` other than `published` requires
    `canReadUnpublished` on every collection in scope.
  - **`@cogenta/cli`** creates the index at startup, wraps every collection's
    store with it, mounts `/api/search`, and serves a public `/search?q=…`
    page with a real form and real links (`noindex`, as a search results page
    must be). The public page is a **route, not a contract B block**: contract
    B is frozen and adding a block needs an RFC, which does not belong in a
    lot whose premise is "wiring only".

- [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06) Thanks [@georgesmomo](https://github.com/georgesmomo)! - CORS, security headers and a coherent cache-control on `cogenta serve`
  (L10 task 6).
  
  `@cogenta/core`'s configuration gains a `security` section:
  
  ```ts
  security: {
    cors: { origins: ['https://app.example.com'], credentials: false },
    csp: "default-src 'self'",
    hstsMaxAge: 31536000,
    pageMaxAge: 60,
  }
  ```
  
  Every field is off or permissive-by-omission by default, and that is a
  decision rather than timidity. CORS is off unless a site names an origin —
  the origin list *is* the switch, so "CORS is on" and "these origins may read
  it" cannot drift apart. HSTS is off unless asked and is never sent over plain
  HTTP: on a host that is not fully HTTPS it locks browsers out for `maxAge`
  seconds with no server-side undo, and it is the one header a wrong default can
  take a site offline with. Credentials together with the `*` origin is refused
  at startup, because every browser refuses that pair and a server that accepted
  it would look configured while granting nothing.
  
  `cogenta serve` applies all of it in one place, before any route runs, so a
  route added later cannot opt out by forgetting:
  
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and
    `Referrer-Policy: strict-origin-when-cross-origin` on every response.
  - The configured CSP verbatim — a string, not a builder, because a CSP depends
    on which analytics, fonts and embeds a site actually uses.
  - CORS with an echoed (never blindly reflected) origin and `Vary: Origin`,
    plus a real preflight answer.
  - Cache-control by path class: `no-store` for `/api/*` and for the admin,
    `public, max-age=0, s-maxage=<pageMaxAge>, must-revalidate` for a public
    page, and the long immutable value image variants already set for
    themselves.

- [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Four corrections to L19, from the contract review.
  
  **ADR-0010 wins over the lot document.** Applying a site plan writes
  `cogenta.schema.*` and creates tables — that is the schema editor arriving by a
  different door, and ADR-0010 says it plainly: "uniquement en mode
  développement. En production le schéma est en lecture seule." L19's brief asked
  for the opposite ("un site déjà en production peut recevoir de nouveaux
  documents"); the acted decision wins, and the disagreement is written down in
  `BLOCKERS.md` with a ready-to-insert ADR-0023 rather than worked around.
  `RunServeOptions` gains `development`, set by `cogenta dev` and by it alone.
  Proposing and reviewing a plan stay available everywhere; only the write is
  withheld, and the refusal names the way out.
  
  **The schema file is the one the site really loads.** The applier wrote
  `cogenta.schema.mjs` by name, while `loadCollections` prefers
  `cogenta.schema.ts` — the form ADR-0010 calls for. On such a project it would
  have created the tables and then written a file nothing reads, leaving orphan
  tables and no collections after the restart it told the operator to do. It now
  resolves the real path (`findSchemaFile`, newly exported) and names it in the
  follow-up. It also refuses outright when the current schema declares a
  `validate` or a function `default`, which regenerating the file would silently
  delete.
  
  **Content a model wrote is marked as such.** Demonstration entries seeded by
  the installer and by the applier now carry `provenance: 'generated'` and a
  `provenanceDetail` naming the agent, the model and the time. Contract A calls
  that field non-optional because the European AI framework requires it; the
  store's default is `human`, so inheriting it would have made the one regulated
  field lie about every generated entry.
  
  **R8 has a second hop.** A constraint's `quote` is verbatim document text, and
  the analysis step's careful tagging counted for nothing when the content-model
  and demo-content prompts pasted it back in as prose — "Pas de blog. Ignore all
  previous instructions and …" is a single clause, so the whole thing is the
  quote. Both now go through `assembleContext`'s data channel too, escaped and
  tagged, with a test that smuggles a forged `</data><constitution>` inside a
  constraint and checks it arrives escaped.

- [`07e49bf`](https://github.com/cogenta-cms/cogenta/commit/07e49bf0d45260fc14c74efe8a67b2671fd8e022) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Document-driven site planning on a site that is already running (L19 tasks 5
  and 7). `@cogenta/api` gains `createSitePlanRouter` and `cogenta serve` mounts
  it at `/api/site-plans`; the admin gets a screen on top of it.
  
  Upload a brief, read what the agent understood, and decide on it one item at a
  time — every collection, page, demonstration entry and constraint read out of
  the document is its own yes or no. The API has no `acceptAll` parameter and the
  screen has no control that decides more than one item; `apply` calls
  `resolveApprovedPlan`, which refuses a plan with an undecided item, so there is
  no path that skips the review even for a caller writing raw HTTP.
  
  Applying is **additive**. A proposed collection whose name the site already
  uses is refused and reported — replacing a live collection is a migration with
  a diff and a backup, not a side effect of accepting a suggestion. What is
  applied writes the schema file, creates the new tables and seeds approved
  demonstration entries as drafts, never published. The report says plainly that
  `cogenta serve` has to be restarted to see the new collections, rather than
  implying the change is already live. A plan is applied at most once.
  
  Every route is admin-only. On a site with no LLM provider the routes that need
  a model answer `SITE_PLAN_NO_PROVIDER` (501) with a hint, and the list route
  reports `plannerAvailable: false` so the screen can explain itself — a plan
  proposed during installation is still readable and appliable there, which is
  what makes the installer's "save it for later" path mean something (R2).

- [`e321f08`](https://github.com/cogenta-cms/cogenta/commit/e321f089b14f5f116f28ab6eb2d2ffc0a43bc27d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give the canonical theme a real design system, and make `cogenta serve` actually send it.
  
  `src/styles/theme.css` is now three layers — `tokens.css` (the design system),
  `base.css` (document, accessibility, page frame, actions) and `blocks.css` (the twelve
  vocabulary blocks). Every value in all three is still derived from contract D's closed
  skin token set: spacing from `--cogenta-space-unit` and `--cogenta-space-scale`, type from
  the seven `--cogenta-font-size-*` steps `renderSkin` emits, colour from the seven colour
  tokens through `color-mix()` and relative `oklch()`. No token was added to the contract and
  no colour literal was added to the theme.
  
  **Two real bugs fixed on the way.** The stylesheet referenced `--cogenta-color-accentFg`,
  `--cogenta-color-mutedFg` and `--cogenta-font-baseSize`, but `renderSkin` kebab-cases token
  names, so the real properties are `--cogenta-color-accent-fg`, `--cogenta-color-muted-fg`
  and `--cogenta-font-base-size`. Every muted text colour, every primary button label and the
  entire typographic scale therefore resolved to nothing. A new test derives the expected
  property names from the skin and fails on any future misspelling.
  
  And `cogenta serve` sent the skin's generated custom properties but never the stylesheet
  that uses them, so every served page was styled by the browser's defaults with a skin
  defined and unused. It now inlines the theme's sheet — `@import`s flattened, comments
  dropped, whitespace squeezed — next to the skin's, and renders the same page frame
  `Base.astro` builds: a skip link, a site header with a home link, and a footer.
  
  **Dark mode, designed rather than inverted.** A `light-dark()` palette behind an
  `@supports` guard, with `color-scheme` declared so native controls follow. Elevation is
  expressed as lightness rather than shadow, the accent is lifted and its foreground
  consequently flipped to ink, borders become lighter overlays, and text stays off pure
  white. `design-system.test.ts` computes every one of those colours from the real stylesheet
  — resolving `var()`, `light-dark()`, `color-mix(in oklab, …)` and `oklch(from …)` — and
  asserts AA body contrast on fourteen pairs in both schemes.
  
  `Site.skinCss` is now `Site.styles`, and `assembleSite`'s last parameter with it.

- [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking: `DELETE /api/content/{collection}/{id}` now means "move to the
  trash"**, not "destroy" (`schema@2.0`, ADR-0022). Two routes complete it:
  
  - `POST /{collection}/{id}/untrash` — take it back out;
  - `POST /{collection}/{id}/purge` — destroy it for good.
  
  Purge is a POST on its own path rather than a second meaning for `DELETE`,
  because two verbs on one path with two very different consequences is how
  someone destroys content by reflex. A client that used `DELETE` to really
  remove an entry must now follow it with `/purge`.
  
  `?trashed=include|only` on a list opens the trash; without it a pre-2.0 client
  sees exactly what it saw before. All four operations — including *seeing* the
  trash — require the `delete` permission on the collection: contract A freezes
  the five actions, so the trash borrows the one that fills it.
  
  Serialised entries gain `deletedAt`, orthogonal to `status`: an entry in the
  trash still reports the status it had, which is what restoring gives back.
  
  ### Taxonomy terms over HTTP
  
  `createTaxonomyRouter` mounts `/api/taxonomies`:
  
  ```
  GET    /{taxonomy}            the tree, in tree order
  POST   /{taxonomy}            create a term
  GET    /{taxonomy}/{id}       one term
  PATCH  /{taxonomy}/{id}       rename, relabel, reorder
  DELETE /{taxonomy}/{id}       delete (?cascade=true for the whole branch)
  POST   /{taxonomy}/{id}/move  re-parent it
  ```
  
  Mounted apart from `/api/content` because a taxonomy is not a collection and a
  site may legitimately name both the same thing. The materialised path is
  deliberately **not** serialised — it is a storage decision, and `parent` plus
  `depth` are what a tree renderer needs.
  
  `PermissionLayer` gains `canTerm`/`assertTerm` rather than a widened `can`:
  same role rules, no preview path. A preview token names a collection and an
  entry, so with a `category` collection beside a `category` taxonomy, sharing
  the code path would let a token minted for one unlock the other. Custom
  `PermissionLayer` implementations must add the two methods.
  
  ### In `cogenta serve`
  
  A project declares its taxonomies as a named `taxonomies` export beside the
  default one in `cogenta.schema.*`; a schema file written before 2.0 keeps
  loading unchanged and declares none. The server creates the terms tables before
  the collections, mounts `/api/taxonomies`, and passes `siblings` to every
  content store so `restrict` is still enforced when an entry is trashed.

- [`89ec072`](https://github.com/cogenta-cms/cogenta/commit/89ec0724be1dcc50b8fa5f7a14ca026c40e0de89) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Account management moves out of the terminal: `@cogenta/api` gains
  `createUsersRouter`, mounted by `cogenta serve` at `/api/users`.
  
  Until now `cogenta users create` was the only way to make an account. The new
  routes are:
  
  - `GET /api/users` (admin) — every account, optionally filtered by `?role=`,
    each with a summary of the second factors it holds
  - `POST /api/users` (admin) — creates the account and returns a server-generated
    password exactly once, the same rule the CLI already follows. The admin never
    chooses it.
  - `PATCH /api/users/{id}` (admin) — roles and status. Disabling an account
    revokes its live sessions in the same move.
  - `GET /api/users/{id|me}` and `GET /api/users/{id|me}/sessions` — yours, or
    anyone's with `admin`
  - `DELETE /api/users/{id|me}/sessions/{sessionId}` — revoke one session
  - `POST /api/users/me/password` — change your own password, current one
    required, rate-limited on the same store as sign-in
  
  Two deliberate absences. There is no delete: accounts are disabled, never
  removed, because an account that wrote content still has to be nameable in the
  audit log. And there is no route for an admin to set somebody else's password —
  that is a reset, it needs a delivery channel and a single-use token to be
  anything but a back door, and it is L13's task.
  
  Two safety properties worth naming, both covered by tests:
  
  - The last active `admin` cannot be demoted or disabled. Not a permission
    question — the person doing it is allowed to — but with no password reset yet
    there is no way back into a site with no administrator.
  - `DELETE /api/users/me/sessions/{id}` checks the session actually belongs to
    the caller before revoking it, so passing someone else's session id under
    `me` is a 404 rather than a successful revocation.
  
  `cogenta serve` records `user.create`, `user.update`, `user.password_change` and
  `user.session_revoke` in the audit log, naming the actor and the subject and
  nothing that could sign anyone in.
  
  `cogenta users create`'s closing hint and `create-cogenta`'s install recap no
  longer tell people they will be asked to set up a second factor at first
  sign-in: since ADR-0021 they will not be.

### Patch Changes

- [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Closes four denial-of-service and permission-escalation gaps a security review found in L19's document-upload pipeline and site-plan review screen, all reachable from a single uploaded file or a proposed content model — no LLM provider required to trigger them.
  
  - `.docx` extraction (`packages/agents/src/documents/docx.ts`): the regex scanning `word/document.xml` for `<w:t>…</w:t>` runs backtracked quadratically on unclosed tags (measured 21.8 s for 400 KB). Replaced with a single linear `indexOf`-based scan, and `word/document.xml`/footnotes/endnotes are now capped at 8 MiB each (`zip.ts`'s `read()` gained a per-call `maxBytes`) instead of the shared 200 MiB decompression-bomb ceiling, since a highly repetitive XML payload can deflate at several hundred to one.
  - PDF stream collection (`packages/agents/src/documents/pdf.ts`): `collectStreams` used an unbounded `lastIndexOf` to find each stream's dictionary, which re-scans the entire prefix of the file for every stream found — a file that is mostly fake `stream`/`endstream` markers with no real PDF structure could cost minutes of CPU with no decompression involved. The search window is now bounded to 2 KiB behind each `stream` keyword, and the number of streams processed is capped at 10 000.
  - PDF text accumulation (`packages/agents/src/documents/pdf.ts`, `extract-text.ts`): `MAX_TEXT_CHARACTERS` was only enforced after every content stream had already been decoded and joined, so a PDF with many individually-small-enough, highly compressible streams could accumulate many times that budget in memory before truncation ever ran. The reader now stops pulling in further pages once the accumulated text already exceeds the cap, moved to a shared `limits.ts` so both `pdf.ts` and `extract-text.ts` read the same number.
  - Site plan review (`packages/agents/src/site-plan/content-model.ts`, `approval.ts`): a proposed content model's `permissions` is entirely the model's own choice, so a hallucinated or prompt-injected proposal granting `public` the `create`/`update`/`delete` actions would have let any anonymous visitor write to that collection once the plan was applied. `buildCollection` now refuses such a proposal outright (`CONTENT_MODEL_PROPOSAL_PERMISSIONS_UNSAFE`, fed back as the next attempt's correction like any other invalid proposal); separately, the human review screen (`summarisePlan`) now always shows a collection's proposed permissions and routing pattern, not only its fields and rationale, so a legitimate-but-surprising grant is visible before acceptance.
  - `cogenta serve` (`packages/cli/src/commands/serve.ts`): `readBody` had no byte limit, and the one route inviting multi-megabyte bodies by design (`/api/site-plans`) only checked the admin role after the body was fully buffered. `readBody` now caps every request body at 64 MiB, rejecting with a new `REQUEST_BODY_TOO_LARGE` error code (HTTP 413); `/api/site-plans` now checks the admin role before reading the body at all, so a non-admin caller — anonymous or not — is turned away before the server reads anything they sent.

- [`b8ed3cf`](https://github.com/cogenta-cms/cogenta/commit/b8ed3cfca3f7b84e5454ffeb357edbe970afa065) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking:** `GET /api/media` and `GET /api/media/{id}` now require an
  authenticated actor, like every other route on that router. They never did,
  despite the file's own doc comment claiming otherwise since L2 — so an
  anonymous request returned every asset's id, filename, alt text, storage key
  and uploader.
  
  That gap became a real exfiltration path the moment L10 added a public
  `/_image?id=…` delivery endpoint: the ids that endpoint is keyed on are
  unguessable UUIDs, but they were *listable*, so every uploaded image —
  including the ones attached to nothing published — was downloadable without a
  session. Found by the security review of this lot.
  
  Any client reading the media library must now send its bearer token. The
  admin already did on every call.
  
  Two related fixes in the same area:
  
  - An uploaded image is stored with the content type its **bytes** earn, never
    the one the uploader declared. Sniffing already decided whether the file is
    an image; repeating the declared type afterwards let a genuine PNG announced
    as `text/html` be served as a document on the site's own origin, publicly
    and cached for a year. `/_image` also whitelists the type it puts on the
    wire, so an asset stored before this fix serves as an opaque download rather
    than executing.
  - `cogenta serve` no longer marks a page rendered for a signed-in actor as
    cacheable by a shared cache. A page render is per-actor — an editor sees the
    draft at the same URL — and `public, s-maxage=…` is precisely what RFC 9111
    §3.5 says re-authorises a CDN to store the answer to a request carrying
    `Authorization`. Anything sent with credentials is now `private, no-store`.
  - `/sitemap.xml` no longer 500s when the site has a routed collection the
    `public` role may not read: such a collection is skipped, since it has no
    public URLs to list.
- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`ad18e0e`](https://github.com/cogenta-cms/cogenta/commit/ad18e0ed335d06ad861958e74bbfd2318e2509b8), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`b8ed3cf`](https://github.com/cogenta-cms/cogenta/commit/b8ed3cfca3f7b84e5454ffeb357edbe970afa065), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`809baee`](https://github.com/cogenta-cms/cogenta/commit/809baee0b47e48aea06235a97c0da29c7ba4b06c), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06), [`45d2815`](https://github.com/cogenta-cms/cogenta/commit/45d281560017abde1a069b01458a709293c1613b), [`a332e41`](https://github.com/cogenta-cms/cogenta/commit/a332e416bfe08a226756451624b6344e7c6b7516), [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc), [`ade7b38`](https://github.com/cogenta-cms/cogenta/commit/ade7b3807fd273e56bcbe7499eb83374a592d35f), [`07e49bf`](https://github.com/cogenta-cms/cogenta/commit/07e49bf0d45260fc14c74efe8a67b2671fd8e022), [`32f5db9`](https://github.com/cogenta-cms/cogenta/commit/32f5db932454aa35e586a4ffe144f909b0b773af), [`e321f08`](https://github.com/cogenta-cms/cogenta/commit/e321f089b14f5f116f28ab6eb2d2ffc0a43bc27d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`89ec072`](https://github.com/cogenta-cms/cogenta/commit/89ec0724be1dcc50b8fa5f7a14ca026c40e0de89)]:
  - @cogenta/core@0.3.0
  - @cogenta/agents@0.2.0
  - @cogenta/api@1.0.0
  - @cogenta/auth@0.2.0
  - @cogenta/schema@0.2.0
  - @cogenta/channels@0.2.0
  - @cogenta/seo@0.2.0
  - @cogenta/theme-canonical@0.2.0
  - @cogenta/blocks@0.1.3
  - @cogenta/import@0.1.3
  - @cogenta/render@0.1.3

## 0.2.2

### Patch Changes

- [`82d7b1d`](https://github.com/cogenta-cms/cogenta/commit/82d7b1de151888df1623262ff6fe104232b4c46e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `/admin` rendering a blank page. Vite always trails its build `base`
  with `/` ("/admin/"), and react-router's `basename` match is a literal
  string prefix — a request for exactly `/admin` (no trailing slash, the URL
  a real user actually types or gets redirected to first) does not start
  with "/admin/", so the router silently rendered nothing. Confirmed via the
  browser console: `<Router basename="/admin/"> is not able to match the URL
  "/admin"...`. `/admin/` (with the slash) always worked, which is why this
  was easy to miss testing via curl/HTTP status codes alone — a 200 response
  doesn't mean the page actually rendered.
  
  Fixed by stripping the trailing slash from the basename `@cogenta/admin`'s
  `app.tsx` passes to `BrowserRouter` — "/admin" still matches
  "/admin/collections" (still starts with "/admin"), so nothing about deep
  links changes. Verified with a real browser: login → TOTP setup → a
  working dashboard with real site health and audit-log data, both starting
  from `/admin` with no trailing slash.

## 0.2.0

### Minor Changes

- [`7ff79a2`](https://github.com/cogenta-cms/cogenta/commit/7ff79a260f97c79192553e88e2e7e4d22e0d8965) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now serves the real admin SPA (`@cogenta/admin`) under
  `/admin/*`, alongside the public theme render at `/` — there was previously
  no way to reach the admin UI from a scaffolded site at all (`/admin` 404'd,
  and nothing in the installer's recap explained how to get there). The
  admin's own `vite build` is copied into `@cogenta/cli`'s `dist/admin-assets`
  at build time (a plain file copy, not a real npm dependency — `@cogenta/admin`
  stays `private` and unpublished); a request for a real built asset gets that
  exact file (still a real 404 if missing, never silently swapped for HTML),
  and any other path under `/admin` gets `index.html` so the SPA's own
  client-side router (now mounted with `basename="/admin"`, matching the
  build's `base: '/admin/'`) resolves deep links. The API the SPA talks to is
  same-origin (`fetch('/api/...')`), so no CORS or separate-origin auth
  wiring was needed — that boundary was already designed into
  `@cogenta/admin`'s `http.ts`, just never connected to a real server.
  
  Found while answering "how do I log into the admin UI" — the admin app
  itself was real and complete (auth, schema-driven editing, media, audit,
  agents, fleet), it had simply never been wired to anything a scaffolded
  site's `cogenta serve` could reach.

- [`cb69cab`](https://github.com/cogenta-cms/cogenta/commit/cb69cab09b89d3cc5b8d15f5887ec93f82e32599) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now renders real HTML pages, not just the `/api/*` REST and
  GraphQL surface. Until a real Astro build exists (`cogenta build`/`theme` are
  still honestly deferred — no static site generation, no theme dev server),
  this is a scoped in-process stand-in: a GET request that doesn't match
  `/api/*` is resolved against the site's real collection routes
  (`matchPath`/`buildPath`, `@cogenta/schema`), the matching published entry is
  fetched through the exact same permission-checked `ContentGateway` every
  REST and GraphQL request already goes through, and rendered with
  `@cogenta/theme-canonical`'s real `renderPage` — the same function the
  `create-cogenta` blueprint tests already exercise. A collection with a
  `blocks` field renders its real block zone; a `richText`-only collection
  (e.g. `post`) gets its body wrapped in a single real `prose` block rather
  than a second hand-rolled serialiser. Styling comes from
  `@cogenta/render`'s already-tested `renderSkin` against the site's real
  `theme.tokens.json`, never a second token-to-CSS mapping.
  
  No secret, database handle or config value ever reaches theme code — only
  the same `ContentEntry` shape a real HTTP client would receive through
  `@cogenta/theme-canonical`'s own, deliberately separate `ContentEntry`/
  `QueryRequest` contract (ADR-0016's boundary holds even in-process).
  
  Scoped deliberately: no image pipeline is wired in yet (a theme asking for
  one gets `THEME_IMAGE_UNSUPPORTED`, not a broken `<img>`), and a
  cross-reference to an entry this render didn't already fetch resolves to
  `#` rather than a guessed URL — a real Astro site would build a full
  link-graph ahead of render; this stand-in doesn't.
  
  Found and built while investigating why a scaffolded site had nothing to
  show a browser: `cogenta serve` had never rendered a page, only the API.
  
  Building it against a real seeded site surfaced a real, separate bug in
  `assembleSite`: the `ContentGateway`'s store map was only ever populated
  lazily, by REST's own `storeFor` — a collection no REST request had touched
  yet had no store at all, so the very first GraphQL (or now theme-render)
  query against it failed with `INTERNAL`/"has no store" instead of a real
  answer. `assembleSite` now populates every collection's store eagerly, once,
  so REST, GraphQL and the theme-render fallback all see the same complete
  map from the first request.

### Patch Changes

- [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve`'s theme-render fallback (added in a previous, unreleased
  change on this package) 404'd on `/` itself: every `page` collection's route
  pattern is `/:slug`, which structurally cannot match an empty segment. `/`
  now retries once as `/home` — the real, consistent slug every
  `create-cogenta` blueprint seeds its home page at — before giving up. A site
  with no page at that slug still 404s honestly, exactly like any other
  unmatched path; this is not a magic redirect.
  
  Also fixes `runServe` passing its resolved `env` object down to `loadConfig`
  in a way that always looked "explicitly supplied" (see `@cogenta/core`'s
  `env-file-autoload` changeset) — without this, `@cogenta/core`'s new `.env`
  auto-loading could never actually fire from a real `cogenta serve` run.
  
  Both found via the user's own real end-to-end test against a freshly
  scaffolded Portfolio-blueprint site: `/` returned `CONTENT_NOT_FOUND`, and
  `cogenta serve` still demanded a manually exported signing key despite a
  `.env` file sitting right next to the config.
- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2
  - @cogenta/api@0.1.2
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/import@0.1.2
  - @cogenta/render@0.1.2
  - @cogenta/schema@0.1.2
  - @cogenta/theme-canonical@0.1.2

## 0.1.0

### Minor Changes

- [`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/cli` and its first command, `cogenta doctor`.
  
  `doctor` reports which driver is running for each need, **why that one**, and what it
  costs. The "why" is the point: the registry can fall back from Redis to the filesystem
  without anyone noticing, and an operator who cannot see that has a site that is slower
  than they think for a reason nothing told them. Skipped drivers are listed with their
  reason too.
  
  It also states out loud what would otherwise be discovered later — that a site with no
  LLM provider works apart from the agents, that SQLite is one machine with no vector
  index, and that signed media URLs will not survive a restart without
  `COGENTA_STORAGE_SIGNING_KEY`. An invalid configuration is reported as the offending
  fields rather than a stack trace, and exits non-zero so a deployment script notices.
  
  Core gains `loadConfig` and `findConfigFile`, which walk up from the working directory
  the way a package manager looks for a lockfile. A missing config file is not an error: a
  container configured entirely through `COGENTA_*` and `DATABASE_URL` is a legitimate way
  to run.

- [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the agent administration interface (L5 task 9): "état, autonomie,
  budget, historique, traces".
  
  `@cogenta/agents`: `BudgetTracker` gains `usage(): BudgetUsage` — a
  read-only snapshot of the same three calendar-bucketed counters
  `checkCall`/`recordCall` already track, needed so an admin can show
  real spend against budget.
  
  `@cogenta/api`: a new `/api/agents` router (`createAgentsRouter`),
  structural against `AgentRegistryLike`/`TraceStoreLike`/`AuditLogLike`
  — no hard dependency on `@cogenta/agents`. Lists agents with their
  state/autonomy/budget/usage, enables/disables one, and reads its
  traces/history (empty list, not an error, when a trace store or audit
  log was not wired in).
  
  `@cogenta/cli`: `assembleSite` accepts an optional `agents` option;
  `/api/agents` is only mounted when it is supplied — no site constructs
  one today, so every existing deployment is unaffected (R2).
  
  `@cogenta/admin`: a new "Agents" screen — a list with enable/disable
  per row, and a detail panel showing recent traces and history for the
  selected agent.

- [`5d64afd`](https://github.com/cogenta-cms/cogenta/commit/5d64afdb47dd5bfdbe06cb7895391b726fb22277) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /api/audit` (filterable by `actorId`/`action`/`collection`/`since`,
  paginated by `limit`) and `GET /api/audit/verify` (recomputes the hash
  chain, `AUDIT_CHAIN_BROKEN` naming the first mismatch on tampering) — both
  restricted to the `admin` role.
  
  `@cogenta/auth`'s hash-chained audit log (`createAuditLog`) existed since it
  was built as generic core infrastructure, but nothing wrote to it and no
  route read from it. `cogenta serve` is now its first writer: every
  successful login, logout, content create/update/delete/publish/restore and
  media upload/update/delete records an entry, at the transport layer rather
  than inside each service — one place, so no future write path has to
  remember to call it separately. Recording never blocks or fails the
  response it is auditing.

- [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add passkey registration and passkey login (WebAuthn), completing L2 task 3's second
  factor: TOTP with self-service enrolment, and now passkeys — the spec's primary sign-in
  method.
  
  `@cogenta/auth`'s `AuthService` gains four methods: `beginWebAuthnRegistration`/
  `completeWebAuthnRegistration` for adding a passkey to an already-signed-in account, and
  `beginWebAuthnLogin`/`completeWebAuthnLogin` for a usernameless sign-in — no account is
  named up front; the assertion's own credential id decides which one it is. The challenge
  each ceremony needs between its two requests rides in the same short-lived signed ticket
  the rest of this package already uses, extended with an optional `challenge` field and a
  nullable `userId` (unknown until login resolves it) — never a server-side store for
  something single-use that lives seconds. `AuthStoreOptions` gains `webauthn` (relying
  party config) and `issuer`, both previously accepted by `createAuthService` but silently
  dropped by the store-level factory.
  
  `@cogenta/api`'s `createAuthRouter` exposes this as
  `POST /api/auth/webauthn/{register|login}/{begin|complete}`. `cogenta serve` derives the
  relying party id and origin from `site.url` and the name from `site.name` — one more
  config field to keep, not a new one to add.
  
  `@cogenta/admin`'s login screen leads with "Se connecter avec une clé d'accès" over
  `@simplewebauthn/browser`'s `startAuthentication`, with password-then-TOTP as the
  fallback underneath. Passkey *registration* — adding one to an account — needs a
  settings surface that does not exist yet in the admin and is deferred to when that
  surface is built; the backend and API routes for it are already in place.

- [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `cogenta migrate` — `status`, `up` and `down` — over the existing migration engine.
  
  `status` lists every migration with the date and duration of its run, and marks the ones
  that changed after they were applied here. That last case exits non-zero: two
  environments that ran different SQL under the same id is the worst state to debug, and a
  deployment script has to notice it rather than read it.
  
  Migrations are plain ESM files in a `migrations/` directory next to the configuration
  file, default-exporting an object with `up(tx)` and `down(tx)`. They are ordered by file
  name, the id defaults to the file name, and the checksum is a hash of the file itself —
  so a migration edited after it ran is detected without anyone maintaining a second
  number. A project with no `migrations/` directory has zero migrations, which is not an
  error: L0 ships no business schema at all.
  
  A destructive migration still needs `--confirm-destructive` **and** `--backup-verified`.
  The engine already refused without both; the CLI now makes the refusal actionable by
  naming each destructive migration and printing its declared impact, instead of asking
  the operator to go and read the files.
  
  Core fix, found by running the command from a subdirectory: a relative path in a config
  file is now resolved against **that file**, not against the shell's working directory.
  `cogenta migrate status` run from `src/` used to open an empty `./site.db` next to `src/`
  and report an already-migrated database as entirely pending. The same applies to
  `cache.path` and `storage.path`. Absolute paths, server URLs and `:memory:` are
  untouched, and configuration that comes from the environment alone is unaffected.

- [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 9: real CLI surface for `generate types` and `skin list/validate/apply/generate`, plus `cogenta dev` as an alias for `cogenta serve`.
  
  `generate types` is a thin wrapper around `@cogenta/schema`'s existing `renderTypeDeclarations`, writing to `.cogenta/types/schema.d.ts` by default. `skin list/validate/apply` are thin wrappers around `@cogenta/render`'s existing `validateSkin`/contract-D token groups — `apply` never writes a skin that fails validation.
  
  `skin generate`'s underlying logic (`generateSkin`, the LLM→JSON→validate→retry-on-hint loop built for `create-cogenta`'s L9 task 7) is relocated from `create-cogenta` to `@cogenta/agents` (`@cogenta/agents`'s `generateSkin`/`GenerateSkinOptions`/`GenerateSkinResult`) so both the installer and `@cogenta/cli` can call the same implementation without either depending on the other — `@cogenta/agents` gains a dependency on `@cogenta/render` (the schema/validation it generates against), not the other way around. `create-cogenta`'s `skin-flow.ts` now imports `generateSkin` from `@cogenta/agents`; no behavior change.
  
  `build`, `backup`, `upgrade`, `deploy`, `theme`, `agent`, and `generate schema`/`generate migrations` remain unbuilt — none has a real underlying capability to wrap yet (no Astro build wiring, no backup/restore mechanism, no deploy-target concept, no theme registry, no live `AgentRegistry` anywhere in the codebase, no schema-diff-to-migration generator). `cogenta <command>` for any of these falls through to the existing unknown-command usage message rather than a stub — see CLAUDE.md for the per-command reasoning.

- [`1b54335`](https://github.com/cogenta-cms/cogenta/commit/1b5433577617c1c3a50d123ba1a4e81c7c5c9d97) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `cogenta serve` now streams the file behind a media asset at
  `GET /api/media/{id}/file`. It sits outside `@cogenta/api`'s `mediaRouter`
  because a binary body has no shape in that router's JSON-only `RestResponse`
  — the same treatment `/api/schema` already gets — so it reads the object
  through the storage driver and pipes it straight to the response, gated by
  the same "signed in at all" rule every other `/api/media` route uses.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`3bc0872`](https://github.com/cogenta-cms/cogenta/commit/3bc0872800001aace498f331abbd903c66f750e5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `/api/media` — upload, list, read, edit and delete media assets — over
  the `MediaStore` `@cogenta/core` shipped previously. `cogenta serve` now
  selects a storage driver (S3 or local, same registry the rest of the config
  already uses) and mounts the route alongside `/api/content` and `/api/auth`.
  
  Uploads travel as JSON with the file base64-encoded rather than multipart:
  the REST transport's own contract is "a body already parsed by the
  transport", and staying inside it avoids a multipart-parsing dependency for
  an admin-only upload path. The real file type is read from the bytes, never
  from the declared `Content-Type` or filename — the same check the image
  pipeline already used, moved into `@cogenta/core` in the previous release
  so this route can share it. An image whose bytes are not one of AVIF/WebP/
  JPEG/PNG is refused, naming what it actually is; an SVG upload is refused
  outright, per ADR-0017.
  
  Every route requires an authenticated actor — there is no per-collection
  permission model for media the way there is for content yet, so today's
  gate is "signed in at all," tightened once L4's agent tool permissions
  (contract C's `media.read`/`media.write`) land.

- [`ccfb4e1`](https://github.com/cogenta-cms/cogenta/commit/ccfb4e1c2ff2ccf528ebf4a8656c8f34f2da45ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `cogenta users create` — the bootstrap for the very first admin account.
  
  An admin panel nobody can sign into is not usable, and until now there was no way to
  create the first user at all. `cogenta users create --email <email> --admin` generates a
  random password, prints it once, and stores only its hash — the same path any later
  account goes through, just run from the command line before the admin UI exists to do it
  for you.

- [`b939bf4`](https://github.com/cogenta-cms/cogenta/commit/b939bf4957bceccf01c86775a32acbf32d0925f8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /api/schema` and wire the admin's collection list to it — L2 task 4, "rôles et
  affichage conditionnel selon permissions".
  
  `cogenta serve` computes the schema document once at startup (collections do not change
  while the process runs) and serves it read-only, unauthenticated: it describes shapes and
  which role names an action needs, never content. `@cogenta/admin` fetches it once per
  session through a new `SchemaProvider`, and a small `canPerform`/`readableCollections`
  pair — independently re-implemented rather than imported from `@cogenta/api`, which pulls
  in the database and GraphQL layers that do not belong in a browser bundle — decides what
  to show. The collections page lists only what the signed-in actor may read; the rest are
  not merely disabled, they are absent, matching the acceptance criterion that a hidden
  action is also refused by the API rather than just hidden by convention.

- [`764344a`](https://github.com/cogenta-cms/cogenta/commit/764344abe6869f855b87ff80a2cb6b1b4711c01d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /api/health`, restricted to the `admin` role: the same database and
  storage driver/tier/latency report `cogenta doctor` prints from a terminal,
  now queryable from the running server. Backs the admin dashboard's site
  health widget.

- [`aa878ea`](https://github.com/cogenta-cms/cogenta/commit/aa878ea6766361219fe218e17741ce1d9d9ffd2f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `cogenta serve` — a real HTTP server over `@cogenta/api` and `@cogenta/auth`, and
  the `/api/auth/*` REST routes (`login`, `totp`, `session`) those two now share through
  `@cogenta/api`'s new `createAuthRouter`.
  
  The actor a request authenticates as comes from one function, `resolveActor` — a bearer
  token resolved through `@cogenta/auth`'s sessions, never trusted further than that — and
  both `/api/content/*` and `/api/graphql` call it, so there is exactly one answer to "who
  is asking", not a REST answer and a GraphQL answer that could drift apart.
  
  Collections load from `cogenta.schema.ts` next to the config file, the same
  dynamic-import convention `migrate.ts` already used for migrations. `serve` refuses to
  start without `COGENTA_AUTH_SIGNING_KEY` rather than inventing one, since a signing key
  that changes on every restart would silently invalidate every in-flight MFA ticket.
  
  Passkey ceremonies and TOTP enrolment are not in this router yet — both need a challenge
  held between two requests, which is deliberately out of scope for this pass and tracked
  for L2 task 3.

- [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package `@cogenta/import`: `cogenta import wordpress <file.xml>` (L9 task
  6). Imports a WordPress "Export All Content" WXR file — posts, pages,
  categories, tags, media (downloaded and re-stored through `MediaStore`/
  `StorageDriver`), authors (as real, credential-less users), approved comments,
  postmeta (carried as opaque `f.json()` `customFields`, contract A has no
  free-form field kind), Gutenberg blocks converted to the block vocabulary
  (`prose`/`mediaFigure`/`quote`/`gallery`/`embed`) where a mapping exists, and
  301 redirects from each entry's old permalink (`reason: 'import'`, the
  `@cogenta/schema` redirect store's own case for this). Every WXR reader is a
  zero-dependency, WXR-scoped XML tokenizer (`deps-auditor` rejected
  `fast-xml-parser`: a single-maintainer seven-package split published the same
  day, and a general parser's DTD support is an unnecessary XXE surface for a
  file of unknown provenance) — a document declaring `<!DOCTYPE ... ENTITY` is
  rejected outright.
  
  Nothing that cannot be converted is silently dropped: an unmappable Gutenberg
  block, a dead media URL, an author with no email, a trashed post — every one
  of them lands in the returned `ConversionReport` (`imported`/`skipped`/
  `unconvertedBlocks`/`warnings`), which `cogenta import wordpress` prints. The
  command exits `0` even with items reported as unconverted — a reported
  partial import is the intended outcome for a real-world export, not a
  failure — and only exits non-zero when the file cannot be read or parsed at
  all.
  
  Two new `@cogenta/core` error codes: `IMPORT_WXR_PARSE_FAILED`,
  `IMPORT_WXR_UNSAFE_DOCUMENT`.

### Patch Changes

- [`ec2529b`](https://github.com/cogenta-cms/cogenta/commit/ec2529b7c7cb70c0c91d8275fdac4811b2d1073a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `cogenta serve` crashing on Windows the moment `cogenta.schema.ts`
  doesn't exist, instead of falling through to the next candidate filename
  (`.mts`, `.mjs`, `.js`).
  
  `loadCollections`'s `isModuleNotFound` decided whether a missing candidate
  was safe to skip by checking that the thrown error's message contained the
  candidate's `file://` URL. On Windows, Node's own `ERR_MODULE_NOT_FOUND`
  message embeds the raw OS path (`C:\...`) instead of the URL form, so the
  check never matched — the first missing extension in the candidate list
  (typically `.ts`, since most real sites use `.mjs`) surfaced as a hard
  `SCHEMA_INVALID` failure rather than being silently skipped.
  
  Now matches either form. Found via the same end-to-end local-registry test
  that surfaced the `create-cogenta` blank-schema bug (see that changeset) —
  after fixing the schema file itself, `cogenta serve` still failed on
  Windows specifically, for this unrelated reason.

- [`7a16841`](https://github.com/cogenta-cms/cogenta/commit/7a168415e2fce628d4a835eb778be396104a2590) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add preview links: `POST /{collection}/{id}/preview` mints a one-hour,
  one-entry `PreviewGrant` token and returns the entry's real page path/URL
  alongside it (`site.url` + the collection's routing pattern). Any read of
  that one entry — `GET /{collection}/{id}` or `GET /-/by-path` — now accepts
  `?preview=<token>` together with `?state=working` to unlock exactly that
  entry's draft for whoever holds the link, and nothing else; a token for one
  entry never covers another, and a request with no token behaves exactly as
  it did before this change.
  
  The token is verified lazily, only when a `preview` query parameter is
  actually present, so an ordinary request never needs
  `COGENTA_PREVIEW_SIGNING_KEY` to be set at all — only minting and consuming
  a preview link do.
  
  `cogenta serve` passes `site.url` through to the REST router so a minted
  link is a ready-to-open absolute URL, not just a token the caller has to
  build a path for by hand.

- [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `GET /{collection}/{id}/translations`, listing every live entry of the
  translation family an id belongs to (ADR-0014: one entry per language,
  linked by `translationOf`) — itself included, gated the same way `history`
  already is (only an actor who may read this entry's working state may
  enumerate its family).
  
  `buildSchemaDocument` accepts an optional second `site` argument
  (`{locales, defaultLocale}`), included in the document only when given —
  `.cogenta/schema.json`'s own build-time call is unaffected. `cogenta serve`
  now passes it through to `/api/schema`, so the admin can render a locale
  switcher without hardcoding assumptions about which locales a site has.
  
  Fixed along the way: `cogenta serve` was hardcoding `locales: ['en']`,
  `defaultLocale: 'en'` into the content service's routing options instead of
  reading `config.site.locales`/`defaultLocale` — a site configured for more
  than English silently only ever routed English. `translationOf` on create
  was already fully wired end to end (REST body → `ContentStore.create`); no
  change was needed there.
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`5d64afd`](https://github.com/cogenta-cms/cogenta/commit/5d64afdb47dd5bfdbe06cb7895391b726fb22277), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`7a16841`](https://github.com/cogenta-cms/cogenta/commit/7a168415e2fce628d4a835eb778be396104a2590), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`3bc0872`](https://github.com/cogenta-cms/cogenta/commit/3bc0872800001aace498f331abbd903c66f750e5), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`99aa9b2`](https://github.com/cogenta-cms/cogenta/commit/99aa9b2fb2bbedeacf658b57008a863f6af81d45), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`aa878ea`](https://github.com/cogenta-cms/cogenta/commit/aa878ea6766361219fe218e17741ce1d9d9ffd2f), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
  - @cogenta/api@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/render@0.1.0
  - @cogenta/import@0.1.0
