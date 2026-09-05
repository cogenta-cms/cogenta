# @cogenta/api

## 2.0.0

### Major Changes

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
- 08e394b: A real, persisted conversation with an agent, and two robustness fixes found by using it live against DeepSeek.
  
  **The conversation.** Two chat surfaces — the agent detail page and the floating widget — used to keep their own local transcript, so starting a conversation on one and reopening the other never "loaded" it: there was nothing server-side to load. `@cogenta/agents` gains `AgentConversationStore` (memory + file implementations, one per `(agentName, actorId)` thread) and `RunAgentOptions.history` (real prior turns threaded into the model call, not folded into the instruction text); `@cogenta/api`'s `agents-router.ts` gains `GET/DELETE /api/agents/:name/conversation` and `POST .../conversation/messages`; `@cogenta/cli` wires a file-backed store under `.cogenta/agents-runtime/conversations`. Both admin chat surfaces now read and write through the same thread.
  
  **Found while testing it for real:**
  - A content-generation reply came back empty (`stopReason: 'max_tokens'`) — the default per-call budget (2000 tokens) was tuned for a short reply, not a real draft with a rich-text body. Raised to 8000 (6000 for a sub-agent hop).
  - A stalled DeepSeek response left the request — and the browser tab awaiting it — hanging for minutes with nothing logged and no way to recover short of killing the process. None of the three provider adapters (OpenAI-compatible, Anthropic, Google) ever bounded a call on their own. Each now falls back to a 180s timeout when the caller supplies no cancellation signal of its own, and reports a named "did not answer in time" error rather than hanging forever.
  
  Also: the `content.schema` tool (introspects a collection's field shape and the block vocabulary — closes the gap where the superagent could only guess field names when asked to draft content) is now visible in the admin's own permission checkboxes, and the superagent detail page opens straight on the chat, with every configuration field moved behind a "Réglages" button, and the technical log truncated with a "show all" toggle.
- d0a3250: Fiche 55 (agent creation, full flow): `AgentIdentity`/`StoredAgentIdentity`/`AgentIdentityFields`
  gain an optional `systemPrompt`, distinct from `style` — a fourth, additive `## System
  prompt` section in `renderIdentityMarkdown`/`parseIdentityMarkdown`, included in the
  assembled context (`identity/context.ts`'s `agentSection`) right after `style` when
  present. An `identity.md` written before this change (no such section) still parses —
  `systemPrompt` simply comes back `undefined`.
  
  `AgentModelPreference` gains an optional `model`: an explicit model id for one agent,
  distinct from `preferred`/`fallback` (which name a *provider*). When set,
  `createAgentRunner`'s `resolveProvider` returns a `ProviderClient` whose `model` is
  overridden to it; absent means "use whatever the resolved provider is configured with",
  the behaviour every agent had before this field existed.
  
  New tool `assist.generate_agent_identity` (`@cogenta/agents`, permission
  `content.suggest`, `sideEffects: false`): drafts a `role`/`objectives`/`style`/
  `systemPrompt` from a short brief and a tool-name list, always as a reviewable draft
  (`applied: false`, pinned literal — R6). The site owner's purpose and constraints travel
  through `assembleContext`'s DATA channel exclusively, never interpolated into the
  instruction text, the same posture L19's `analyseBrief` already takes with an uploaded
  brief (R8, applied defensively even to this first-party admin-form input). Seeded as a
  new builtin prompt template ("Generate agent system prompt", fiche 45), editable from
  the Prompt Settings screen.
  
  `@cogenta/api`'s `agents-router.ts`: `AgentWriteInput.identity` and
  `AgentRegistryLike.readIdentity`'s return type both gain the same optional
  `systemPrompt`. A non-string `identity.systemPrompt` is refused with
  `AGENT_DEFINITION_INVALID` (400), same as an invalid `role`.
  
  Hardening (security review): `identity/context.ts`'s `agentSection` now escapes
  `name`/`role`/`objectives`/`style`/`systemPrompt` with the same `escapeForTag` the `data`
  channel already used, so a literal `<`/`>`/`"` in any of them — most plausibly in a
  `systemPrompt` a "generate" click filled with raw model output before a human saved it —
  can no longer forge a fake `</agent><task>…` boundary in the assembled system prompt.
  Defense in depth, not a fix to an exploitable path: `withAutonomyForManifest` never reads
  this text, so no permission or autonomy level could ever be affected by it.
  
  All additive — no existing field, tool signature, or wire shape changes meaning.
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
- deece35: `GET /api/agents` and `GET /api/agents/:name` now pass through the rest of contract C's
  `AgentDeclaration` that was already real but never left the server: `skills`,
  `subagents`, `model`, `memory` and `triggers`. `AgentSummary`/`AgentRegistryLike` gain
  these fields, all optional and typed `unknown` exactly like the existing `autonomy`/
  `budget` fields, for the same reason — this package stays structural, never gaining a
  hard dependency on `@cogenta/agents` just to describe them. Purely additive: an existing
  caller whose `AgentRegistryLike` implementation never set these fields simply omits them
  from the response, same as before.
  
  Lets `packages/admin`'s Agents screen (fiche 4, L21 task 4) show an agent's full
  declared configuration — per-tool autonomy overrides, all three budget metrics, the
  complete contract C permission checklist, skills, subagents, model preference, memory
  configuration and triggers (including cron schedules) — instead of only the enable
  toggle, `autonomy.default` and `budget.tokensPerDay`. Everything beyond enable/disable
  is shown **read-only**: no `AgentRegistry` in this codebase can persist an edit to any
  of these fields today, so an editable control for them would have no real backend
  effect (R6).
- 2c4de46: Fiche 64 (analytics: trend lines) — the analytics summary now carries a
  day-by-day breakdown for the previous period, not just its scalar total.
  
  `@cogenta/analytics`'s `AnalyticsSummary` gains `previousDailyViews`, computed
  by `getSummary` with the same `substr(at, 1, 10)` grouping `dailyViews`
  already used, scoped to `[previousSinceIso, sinceIso)`. This is what lets a
  consumer draw the previous period as a second series lined up against the
  current one — until now the only previous-period signal was
  `previousTotalViews`, enough for a `%` badge but not for an overlay line.
  Additive: every existing field keeps its exact shape and meaning.
  
  `@cogenta/api`'s `GET /api/analytics/summary` gains an optional `?limit=`
  (1–100, default unchanged at `DEFAULT_SUMMARY_LIMIT`/10), forwarded to
  `getSummary({ limit })`. This is what lets a caller ask for more than 10
  `topPages`/`topReferrers` rows to paginate over client-side — the store has
  no offset-based pagination of its own, so "give me more rows" is the only
  way to page past the first ten. An out-of-range value is rejected the same
  way `?days=` already is (`QUERY_INVALID`, 400).
  
  Both changes are additive and backward compatible: an existing caller that
  never passes `?limit=` or reads `previousDailyViews` sees no change in
  behaviour.
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
- 7b7ec0b: Add `ContentStore.count()` — a single `GROUP BY status` plus a trash count,
  never a page scanned client-side — and `ContentService.summary()` /
  `GET /-/summary` on top of it: one request that answers every collection an
  actor may read with its status counts (`draft`/`scheduled`/`published`/
  `archived`/`trashed`/`total`), each figure `null` rather than a fabricated
  `0` when the actor may not read that collection's unpublished rows or its
  trash. This is the shared implementation the admin's dashboard content
  summary widget and the collection list's status tabs both build on. Purely
  additive: no existing method, route or response shape changes.
- 0ca8a79: Add optimistic concurrency detection and per-field error naming for the entry editor (fiche 02, tasks 3 and 7).
  
  - `@cogenta/core` gains the `CONTENT_STALE_WRITE` error code.
  - `@cogenta/schema`'s `UpdateInput` gains an optional `expectedUpdatedAt`. When a caller
    passes it, `update()` compares it against the live row's `updatedAt` and refuses with
    `CONTENT_STALE_WRITE` (409) if someone else's write landed first, instead of silently
    overwriting it. Omitting it keeps the previous last-write-wins behaviour unchanged.
  - `@cogenta/api`'s `PATCH` body accepts the new `expectedUpdatedAt`, and `errorResponse`
    now includes `error.field` for `CONTENT_INVALID`/`CONTENT_SLUG_INVALID` refusals, naming
    the schema-declared field the error is about so a client can drive per-field validation
    UI without parsing the message.
  
  Both additions are additive and backward compatible: existing callers that never send
  `expectedUpdatedAt` see no behaviour change, and `error.field` is only ever present for
  the two codes listed above.
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
- c555723: Fiche 67 tasks 1, 3 and 5: the audit log, the scheduled-tasks queue, and the
  API key list now page instead of loading everything at once.
  
  **Audit log** (`@cogenta/auth`'s `AuditLog.list`, `@cogenta/api`'s
  `GET /api/audit`). `AuditFilter` gains `before: { at, id }` — strictly older
  than that position in the `order by at desc, id desc` listing, the same
  checkpoint shape `AuditChainPoint` already uses for a *different* purpose
  (chain verification, never confused with this listing cursor). The route
  answers with `page: { hasMore, nextCursor }` alongside the existing `data`
  array; `?after=` walks the cursor. Additive: an existing caller that never
  sends `after` or reads `page` keeps getting the same `data` shape, just
  capped at a new, smaller default page size (50 instead of the previous
  unpaginated 200) — anyone relying on more than 50 entries in one call now
  paginates or raises `?limit=` up to the unchanged ceiling of 200.
  
  **Scheduled-tasks queue** (`GET /api/scheduled-tasks/queue`). Gains
  `?limit=` (bounded to 500), forwarded to the existing
  `QueueDriver.list`/`ListJobsOptions.limit` both drivers (`database`,
  `bullmq`) already implement — no driver interface change. Absent `?limit=`
  keeps the driver's own default (50) exactly as before.
  
  **API keys** (`@cogenta/auth`'s `ApiKeyStore.list`, `@cogenta/api`'s
  `GET /api/api-keys`). `ApiKeyStore.list` gains an optional
  `{ limit?, offset? }`; both omitted still returns every key, unpaginated,
  byte for byte — the shape every existing caller depends on. The route gains
  `?limit=`/`?offset=` and answers with `page: { hasMore }` alongside `data`.
  
  None of this is a breaking change: every route's `data` shape and every
  store method's zero-argument call are unchanged.
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
- e8061e2: `ContentStore` gains `countByStatus()`, a real `GROUP BY status` count of a
  collection's live (non-trashed) entries. `ContentService` gains a matching
  `counts()`, and `GET /{collection}?counts=1` now returns a `counts` field
  alongside the page — a role that may not read unpublished content only ever
  gets the `published` count, never the others (not even as `0`).
  
  The server-side title fallback used for search results (`searchDocumentFor`)
  now checks fields named `title`, `name` or `label`, in that priority order,
  before falling back to the first declared `text` field — matching the same
  convention the admin's collection list, trash screen and relation picker
  already use for "what do we call this entry" (fiche 01, "Liste de contenu",
  task 1). This can change which text labels a search result for a collection
  whose first declared text field is not `title`.
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
- 77c680d: Added `POST /api/media/-/bulk-usage`, a new route that reports content usage for
  several media assets at once (one `MediaUsageReport` per id, reusing the same bounded
  scan `GET /api/media/{id}/usage` already runs). Lets the admin warn before a bulk
  delete orphans a real reference, without blocking the delete itself.
- 3fb9e11: L25 task A0b — `createMediaRouter`'s upload handler now delegates the actual
  ingestion (real-type verification, GPS scrub, storage write, variant generation,
  asset-row creation with cleanup on failure) to a new exported function,
  `ingestMediaUpload(deps, input)` (new module `media-ingest.ts`). Behaviour is
  byte-for-byte unchanged — the router's own existing test suite passes unedited —
  this is purely an extraction so a caller outside the REST layer (`create-cogenta`'s
  `seedDemoMedia`) can run a file through the exact same pipeline a real upload
  takes, rather than a second, drifting implementation of it.
  
  `ImageSize`, `MediaImageProcessor`, `UploadedImageVariant` and `variantKeyFor` now
  live in `media-ingest.ts` and are re-exported from `media-router.ts` under the same
  names — no consumer of `@cogenta/api`'s public exports needs to change anything.
- 54409f3: Media library (fiche 11): tags, usage tracking, in-place replace, and richer
  listing.
  
  **Breaking for a custom `MediaStore` implementation**, written as `minor`
  following this project's established pre-alpha convention (0.x, no package
  has ever used `major`, and one here would jump straight to `1.0.0` — which
  "pre-alpha" contradicts). `@cogenta/core`'s `MediaStore` interface gains two
  new required methods, `count()` (the total match count ignoring
  `limit`/`cursor`, so the admin can show "2,000 assets" instead of only "there
  is another page") and `replace()` (overwrite the bytes behind an existing id
  in place — every entry and block already holding that id keeps working,
  unchanged). `MediaAsset` gains two new required fields: `tags` (free-form
  labels, not a hierarchy — an asset commonly belongs to more than one subject
  at once) and `contentHash` (a short digest of the stored bytes, folded into
  `/_image` URLs as `&v=` to bust the year-long immutable cache when an asset
  is replaced — never a secret, never used for integrity). The only
  implementation in this repo, `createDatabaseMediaStore`, is updated; a
  third-party driver is not.
  
  Backward-compatible additions: `CreateMediaInput`/`UpdateMediaInput` gain
  optional `tags`; `ListMediaOptions` gains `tag`, `from`/`to` (created-at
  range), `sort` (`MediaSortField`: `createdAt`/`filename`/`size`), and
  `direction`. `@cogenta/render`'s `MediaAsset` gains an optional `version`
  field (`theme@1.2`) — absent is fully backward compatible, exactly today's
  behaviour with no `&v=` appended.
  
  `@cogenta/api`'s `createMediaRouter` gains real multipart parsing
  (`packages/api/src/rest/multipart.ts`, zero new dependency — R9/R10), a
  `POST /api/media/{id}/replace` route, `tag`/`from`/`to`/`sort`/`direction`
  query parameters on the list route, and EXIF GPS stripping on upload and
  replace (`stripGps`, opt-out per request, default on — a photo's location is
  not something an editor usually means to publish).
  
  `@cogenta/schema` gains `findMediaUsage` (`packages/schema/src/media-usage.ts`):
  scans every collection's entries for a media id in a `media`/`richText`/
  `blocks` field and reports where it is referenced, so the admin can warn
  before deleting an asset still in use rather than after. `titleOf` (from
  `search/extract.ts`) is now exported — `findMediaUsage` needed the same
  "what does an editor call this entry" logic the search indexer already had,
  and duplicating it would have drifted.
- 2285720: Menus gain a real editor (fiche `docs/plans/09-menus.md`):
  
  - **Edit an item in place.** `PATCH /api/menus/{id}/items/{itemId}` now accepts `label`, `kind`, the target fields, `title` and `openInNewTab` — no more delete-and-recreate to fix a typo. Changing `kind` clears the previous target rather than keeping a value that no longer applies. `parent` is deliberately not accepted here; re-parenting still goes through `POST .../move`.
  - **Bulk, transactional reorder.** `MenuStore.reorderItems` and `PATCH /api/menus/{id}/items` rewrite `parent`/`position` for any number of items in a single transaction, so a drag-and-drop or keyboard reordering session commits (or fails) as one unit — never a partially-rewritten tree if the network drops mid-session.
  - **Menu locations.** `Menu` gains `location: string | null` (`byLocation`, `GET /api/menus/by-location/{location}`) — where a menu renders (`primary`, `footer`, …), carried by the menu itself rather than baked into a theme's name convention. `@cogenta/cli`'s `ThemeRenderOptions` gains `headerMenuLocation`/`footerMenuLocation`, resolved generically by location with a fallback to the legacy `main`/`footer` name lookup, so an existing site's navigation keeps rendering unchanged. `@cogenta/core` gains the `MENU_LOCATION_TAKEN` error code for the one-menu-per-location-per-locale rule.
  - **Two new item kinds.** `taxonomy` (links to a term) and `home` (always resolves to `/`) join `entry`/`url`/`submenu-placeholder`.
  - **Target health.** A menu item resolver may now report `health` (`published`/`draft`/`scheduled`/`archived`/`trashed`) for an `entry` item — computed only for an actor whose role already has draft access to the target collection, so a public read never learns that a draft exists. `cogenta serve`'s public render hides a dead `entry`/`taxonomy`/`home` link entirely rather than serving one.
  
  All additions are backward compatible: `resolveEntry` gained a third `context` parameter and an optional `health` on its result, but a two-argument resolver still satisfies the type; every new field is optional or nullable on the wire.
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
- 2c1af5d: Fiche 28 (tâches planifiées): a real scheduled-task registry and its admin
  screen — task 1 (registry) and task 2 (screen) complete and tested; task 4's
  concurrency-safe scheduled publication verified. `cogenta serve`'s own
  wiring of the registry, and the standalone `cogenta cron` command (task 5,
  for hosts with no permanent process), are **not done** — see below.
  
  - `@cogenta/schema`'s `ScheduledTaskRegistry` (`createScheduledTaskRegistry`):
    each task declares a name, description, interval and run function; the
    registry persists every run (`cogenta_scheduled_task_runs`) — last run,
    duration, outcome, error — so "did the trash sweep run last night" survives
    a restart rather than resetting with an in-memory timer. `overdue` is
    computed from that persisted timestamp (fiche 28's own named pitfall: a
    detector that lives in memory is blind exactly when a restart makes it
    matter).
  - `@cogenta/api`'s `createScheduledTasksRouter` (`GET /api/scheduled-tasks`,
    `GET .../{name}`, `POST .../{name}/run`, `GET .../queue`,
    `POST .../queue/{id}/retry`) — admin-only, thin read-through, "run now"
    never awaits its own audit write so a slow log never hangs the request.
  - `@cogenta/core`'s `QueueDriver` gains `list()`/`retry()` — the "file" section
    of the screen, and the way a failed maintenance job (fiche 24's queue) gets
    retried from the UI instead of a terminal.
  - `@cogenta/core`'s config gains `scheduler.mode` (`'internal'` |
    `'external-cron'`) and `backup.*` (interval/keep/dir) — resolved, defaulted,
    not yet consumed by `cogenta serve` (see below).
  - Admin: `/scheduled` (new nav entry, admin-only at the route level — R4, the
    nav link itself is not the gate) — task table with last run/duration/
    result/next run, an overdue badge, "run now" with a confirmation dialog for
    a `destructive` task (the trash sweep), a queue section with retry, and a
    pointer to the dashboard's own scheduled-content list rather than a second
    copy of it.
  
  **Genuinely not done, not just deferred quietly**: `cogenta serve` still
  drives scheduled publication, the trash sweep, the 404-log purge and the
  audit-integrity check on their own separate `setInterval`s, exactly as
  before this fiche — none of them are registered with the new
  `ScheduledTaskRegistry`. The registry and the admin screen above are real
  and fully tested against a registry populated by hand in their own test
  suites, but on a running `cogenta serve` today `/scheduled` would show an
  empty task list, because nothing calls `registry.register()` there yet.
  Wiring that in, and the `cogenta cron` command (task 5 — the fiche's own
  §8 leaves "deliver now or later" as an open decision), is real remaining
  work, not a rename or a config flag. Flagged here rather than left to be
  discovered later.
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
- 9e67928: Taxonomy terms can now be edited (multi-locale labels, slug) and moved to a new parent without losing classification, per ADR-0022's materialised-path model. `GET /api/taxonomies/{name}` gains `?q=` (accent- and case-insensitive search), `?counts=1` (per-term entry counts, direct and with descendants) and `?unused=1` (terms nothing classifies), each permission-gated the same way ordinary content reads are. `countTaxonomyUsage` is a new export of `@cogenta/schema`.
- 954460e: Add the translation dashboard (fiche 10 task 1) — everything needed to answer "what
  is still missing in each language" in one screen, without an `N × M` scan.
  
  `@cogenta/schema`'s `ContentStore` gains `translationsOfMany(rootIds)`: every
  working-state translation of a batch of root entries, in one query. A custom
  `ContentStore` implementation (uncommon — everyone else constructs one through
  `createContentStore`) needs to add it.
  
  `@cogenta/api`'s `ContentService` gains `translationMatrix(context, name, query)`,
  and REST gains `GET /{collection}/-/translation-matrix`: one row per root entry
  (`translationOf: null`), one cell per locale carrying its state (absent, draft,
  published, archived, scheduled) and, when the locale is a translation, whether the
  source changed since (`obsolete`) — a plain `updatedAt` comparison, stated as a fact
  rather than a verdict, per the fiche's own recommendation for signal (a). Requires the
  same `read` permission `GET .../translations` already does, plus the working-state
  gate; every row still passes the ordinary per-entry draft/preview gate.
  
  Honestly scoped: today's `PermissionLayer` has no per-locale permission, only
  per-collection — a role cannot be "denied French" independently of the collection
  itself. That is a permission-model change, not a dashboard change, and is
  deliberately out of this note's scope.
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
- 3824e8e: Fiche 06 (versions et historique): `diff.ts` gains `diffWords`, `extractPlainText` and
  `enrichWordDiffs` — a longest-common-subsequence word diff (R9: no diff dependency) that
  turns a `changed` `text`/`richText` field's before/after into the actual words that moved,
  rather than the flat "changed" a caller had to render on its own. `FieldChange` gains an
  optional `words` property carrying this — populated only by `enrichWordDiffs`, never by
  `diffValues`/`diffContent`/`diffBlocks` themselves, so the plain structural diff every
  existing caller (REST, and any agent tool built on `ContentStore.diff`) already relies on
  is unchanged unless it opts in.
  
  `@cogenta/api`'s `GET /{collection}/{id}/diff` now calls `enrichWordDiffs` on the store's
  result before returning it, so a corrected word in the admin's version history shows as a
  corrected word instead of "changed" (VersionHistory, `packages/admin`). Additive only: the
  response shape gains an optional field, no existing field changes meaning.

### Patch Changes

- 39d4be1: Fixes a real bug found while verifying the `saas` blueprint (L25):
  `collectDependencies` (`rest/dependencies.ts`) walked a block's `json`
  fields for a nested media reference named `media` (gallery items, logo
  items) but missed `testimonial.attribution.avatar`, the one nested shape
  that names it `avatar` instead — matching `quote`'s own top-level field of
  the same name. A page whose only image reference was a testimonial's avatar
  served a 500 (`THEME_IMAGE_UNSUPPORTED`: the avatar was never declared a
  dependency, so it was never pre-loaded before render) and, more generally,
  never tagged that avatar as a cache/render dependency at all.
- 7d80741: Fixes `collectDependencies`' scan of a block's list-item media references:
  it looked only for a property literally named `media` (gallery items, logo
  items), missing `testimonial`'s own `attribution.avatar`
  (`blocks@2.0`, RFC 0001) — the one vocabulary shape that names its media
  reference `avatar`. A testimonial with an avatar was never declared as a
  dependency of the response it appeared in, so `cogenta serve`'s render
  pipeline (which only preloads media a page actually depends on) never
  fetched it — every real render of a page carrying such a testimonial
  failed with `THEME_IMAGE_UNSUPPORTED`, found end to end while verifying
  `@cogenta/theme-association`'s own scaffolded site.
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
- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [a2516aa]
- Updated dependencies [0e88f30]
- Updated dependencies [2c4de46]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [4335296]
- Updated dependencies [916ef34]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [7b7ec0b]
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
- Updated dependencies [4d3f3c7]
- Updated dependencies [e8061e2]
- Updated dependencies [fe789cf]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [f47e893]
- Updated dependencies [2285720]
- Updated dependencies [46572ba]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [1995d35]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [1cdf7d7]
- Updated dependencies [745ebd8]
- Updated dependencies [4bb6ba3]
- Updated dependencies [960757d]
- Updated dependencies [2d84729]
- Updated dependencies [835d736]
- Updated dependencies [07c0f0a]
- Updated dependencies [9e67928]
- Updated dependencies [954460e]
- Updated dependencies [3824e8e]
  - @cogenta/core@0.5.0
  - @cogenta/schema@0.4.0
  - @cogenta/analytics@0.3.0
  - @cogenta/auth@0.4.0
  - @cogenta/blocks@1.0.0
  - @cogenta/channels@0.3.0
  - @cogenta/seo@0.3.0
  - @cogenta/forms@0.2.0
  - @cogenta/export@0.2.0
  - @cogenta/mcp@0.2.0

## 1.1.0

### Minor Changes

- [`fa3d13b`](https://github.com/cogenta-cms/cogenta/commit/fa3d13beb1d7394010dcb77e6bab0efbb07e3f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Global search in the admin header (L11 task 4). `GET /api/media` and
  `GET /api/users` both gain an optional `q` query parameter: a case-insensitive
  substring match on filename/alt text for media, and on email for accounts.
  
  Neither gets a real index — `q` filters in memory over a bounded scan (the
  most recent 200 assets for media, the full account list for users, which the
  route already loaded in full). Good enough for the volume an admin media
  library or account list holds today; a real index is `@cogenta/schema`'s
  search engine (`GET /api/search`, unchanged here), built for content.
  
  Both routes keep the permission check they already had *before* applying the
  filter: `/api/media` still requires a signed-in actor, `/api/users` still
  requires the `admin` role. `q` narrows what an already-permitted caller sees,
  it never widens it (R4).
  
  The admin's new global search box (topbar, `packages/admin/src/shell/`) calls
  `/api/search`, `/api/media` and `/api/users` in parallel — three real calls
  rather than one aggregated route, since aggregating server-side would still
  make the same three calls internally for no real benefit.

- [`3b04c56`](https://github.com/cogenta-cms/cogenta/commit/3b04c56ca17291732a1e3f61cfa3b07248708a19) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `unpublish` and `duplicate` REST routes, so the admin's editor can
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

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944)]:
  - @cogenta/analytics@0.2.0
  - @cogenta/core@0.4.0
  - @cogenta/auth@0.3.0
  - @cogenta/schema@0.3.0
  - @cogenta/blocks@0.1.4

## 1.0.0

### Major Changes

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
- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/auth@0.2.0
  - @cogenta/schema@0.2.0
  - @cogenta/blocks@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

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

- [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/api`: the permission layer, preview tokens, REST and GraphQL.
  
  Both transports run on one permission layer, as the lot requires. The hardest rule —
  the `public` role never reaches a draft, on any route, in either transport, whatever the
  query says — is enforced structurally rather than by condition: `canReadUnpublished`
  strips `public` from the actor's roles before looking at anything, so even a collection
  misconfigured with `update: ['public']` cannot become draft access.
  
  A preview token is the single deliberate exception, and it is scoped to one entry. That
  scoping is not free: `canReadUnpublished` is only told which collection is being read, so
  a grant for entry A would otherwise unlock every draft in it. Every path that returns
  entries filters each one through `previewCovers` — the list, the paginated connection,
  reads by id, and relation expansion including the batching loader.
  
  REST is a router over normalised request and response objects, with no HTTP framework and
  no listening socket, so it is tested without a server. Filters use a fixed vocabulary and
  values are coerced from the declared field kind, because a text comparison would rank
  `"10"` below `"9"`. GraphQL derives its schema from the collections, prints the same
  object it executes, and batches relation reads through a thirty-line dataloader written
  here rather than taken as a dependency.

- [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add TOTP self-service enrolment, so a sensitive role with no second factor yet can set
  one up instead of being locked out.
  
  **Breaking within `@cogenta/auth`'s pre-1.0 `LoginResult`**: `passwordLogin` used to
  throw `AUTH_MFA_REQUIRED` for a role that needs MFA but has no factor configured. It now
  returns `{ status: 'totp_setup_required', ticket }` instead — the password was correct,
  and enrolling TOTP right now is the only thing standing between this attempt and a
  session. `AuthService` gains `beginTotpSetup(ticket)` (generates a secret and an
  `otpauth://` URI) and `confirmTotpSetup(ticket, code)` (verifies the code, confirms the
  secret, and signs the user in).
  
  The ticket a `totp_setup_required` result carries cannot be used to complete an ordinary
  `mfa_required` login, and vice versa: `purpose` is now folded into what the ticket's
  signature covers, not checked separately, so the two are a signature mismatch away from
  being interchangeable rather than a bug someone could introduce later.
  
  `@cogenta/api`'s `createAuthRouter` exposes this as `POST /api/auth/totp-setup` and
  `POST /api/auth/totp-setup-confirm`. `@cogenta/admin`'s login screen walks a
  `totp_setup_required` account through it — showing the secret to add to an
  authenticator app and confirming the first code — rather than showing a dead end.

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

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the GraphQL API, generated from the collections and served over the same permission
  layer as REST.
  
  The schema is derived, not written: each collection produces one type carrying its
  declared fields and every system field of contract A, a cursor connection, a filter
  input, a pair of mutation inputs, and the five mutations — create, update, delete,
  publish and restore. A field added to a collection appears in the SDL, in the filter and
  in the mutation inputs at once, exactly as it already appears in `.cogenta/types.d.ts`.
  `renderSdl()` prints the very schema that answers the queries, so the published SDL can
  never drift from the executable one.
  
  GraphQL is a transport here, not a second engine. Queries go through the same
  `PermissionLayer` and the same filter vocabulary as REST — equality, comparison, `in`,
  `contains`, `exists`, `and`, `or` — and there is deliberately no escape hatch: no raw
  `where`, no `state:` argument, no way to name a draft. The state an actor reads is
  derived from the permission layer, so the `public` role cannot reach an unpublished
  entry by identifier, by listing, by filtering on `status`, through an alias or through a
  relation. A preview token is honoured for the single entry it names, checked per entry
  on every path including the batched relation loader.
  
  Pagination is by cursor. The `endCursor` of a page is the position of the last entry
  actually handed out, so a page whose entries were filtered in memory still continues
  where it stopped, and concurrent insertions cannot make a reader see an entry twice.
  
  Relation expansion is bounded, with a low default of two hops, because relations can be
  circular; the `depth` argument may lower the bound but never raise it. Related entries
  are resolved through a small hand-written dataloader that batches by tick and
  de-duplicates, so a page of twenty articles by two authors costs two reads rather than
  twenty.
  
  Errors rendered to a client carry a stable code, a fixed message and a fixed hint, taken
  from a table keyed by the error code. No bound parameter, no identifier, no SQL and no
  stack can reach a GraphQL response; the full error goes to the logger instead. Parse and
  validation errors are the one exception and are returned verbatim, since they run before
  any variable is coerced and can only quote the document the caller just sent.
  
  New direct dependency: `graphql` (MIT, the reference implementation maintained by the
  GraphQL Foundation). Cogenta needs a spec-compliant parser, validator and executor;
  writing one would be thousands of lines of security-relevant code for no gain, and every
  GraphQL client tool expects the real thing. The dataloader, by contrast, is thirty lines
  and is written here rather than added as a second dependency.

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

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/blocks@0.1.0
