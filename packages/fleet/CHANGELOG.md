# @cogenta/fleet

## 0.1.4

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0
  - @cogenta/auth@0.3.0
  - @cogenta/plugins@0.2.0
  - @cogenta/agents-builtin@0.1.4
  - @cogenta/channels@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/auth@0.2.0
  - @cogenta/channels@0.2.0
  - @cogenta/agents-builtin@0.1.3
  - @cogenta/plugins@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents-builtin@0.1.2
  - @cogenta/auth@0.1.2
  - @cogenta/channels@0.1.2
  - @cogenta/plugins@0.1.2

## 0.1.0

### Minor Changes

- [`531a3a8`](https://github.com/cogenta-cms/cogenta/commit/531a3a8294f04062d087aab878330bf028af967f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains staged rollout campaigns: "## Mises à jour groupées"'s
  "canari → 10% → 50% → le reste, un échec arrête toute la campagne."
  
  - **`planWaves`/`orderSitesForCanary`**: real, deterministic wave partitioning
    over an already-ordered site list; canary selection reuses task 5's real
    risk scoring (`computeSiteRisk`) — the lowest-risk site goes first, an
    unscored site never becomes a default canary.
  - **The critical architectural decision**: verification is asynchronous, via
    a site's own next telemetry contact (tasks 2/3's real ingestion path) —
    never a synchronous probe from the control plane to a site, which would
    violate the lot's absolute "le plan de contrôle n'ouvre jamais de
    connexion vers un site" rule established since task 1. `checkProgress`
    only ever interprets signals `SiteStateStore`/`extractInventory` already
    produce; it adds no new transport.
  - **Real halt-on-failure**: a wave with any real failure (version didn't
    reach the target) or a real, bounded per-site timeout (a site that never
    checks back in counts as failure, not an indefinite wait) halts the whole
    campaign — later waves' sites provably never receive an `update` command
    at all, proven by a real integration test injecting a failure in wave 2
    and asserting waves 3/4's command queues stay empty.
  - **Real, durable campaign state**: persisted (`cogenta_fleet_rollout_campaigns`,
    `cogenta_fleet_rollout_site_status`), survives being reloaded from a fresh
    store instance against the same database — a real "control-plane restart"
    simulation. `pre_update_version` per site is the real version-history
    record task 8's rollback execution will consume — not a duplicate of
    `SiteStateStore`'s general drift history, which tracks change over time
    rather than "what this one campaign changed."
  - Two new `@cogenta/core` error codes: `FLEET_CAMPAIGN_NOT_FOUND`,
    `FLEET_CAMPAIGN_STATE_CORRUPT`.

- [`2cd7311`](https://github.com/cogenta-cms/cogenta/commit/2cd7311e24c057cacd1247ae6dcf0f79ee32ba2a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains real-time, operator-facing fleet alerts over
  channels — the companion to task 9's commercial client reports, reusing
  the same `@cogenta/channels` infrastructure for its `alert`-level message
  instead of `report`-level.
  
  - **Three real, closed alert conditions** (`packages/fleet/src/alerts/alerts.ts`):
    `critical-risk` (a site crossing into task 5's `computeSiteRisk`
    `'critical'` tier), `campaign-halted` (task 7's real `CampaignRecord`
    transitioning to `halted`), `site-silent` (a site missing its expected
    telemetry contact — the only real observation channel this architecture
    has, since the control plane never opens a connection to a site).
  - **Anti-flapping, reinterpreted honestly**: "## Pièges connus"'s "exiger
    plusieurs échecs consécutifs depuis plusieurs points" assumes active,
    multi-vantage-point probing this architecture structurally doesn't have.
    The consistent reading: require sustained absence across multiple real
    contact windows (3 consecutive missed daily windows) rather than a
    single missed one — documented explicitly as a deliberate reinterpretation,
    not a literal implementation of wording that doesn't map to a push-only
    architecture.
  - **Real de-duplication** (`createAlertConditionStore`): a condition
    raises exactly once per active episode (`raise()` returns `{fired:
    false}` on every repeat check while still active) and can re-fire after
    a real `clear()` — never a permanent one-time suppression, never a
    repeat alert per check cycle.
  - **Reuses `@cogenta/channels`'s real `buildAlert`** exactly, the same
    reuse discipline task 9 established for `buildReport` — no hand-built
    `AlertChannelMessage` anywhere in this module. `dispatchAlert`'s
    `AlertSender` is a structural interface, never a hard dependency on a
    live channel adapter (no live control-plane deployment exists anywhere
    in this lot).

- [`f5fa0f2`](https://github.com/cogenta-cms/cogenta/commit/f5fa0f2651368c9c8a599d5d40702fcc2c58dd79) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains the control-plane's ingestion boundary and per-site state model (`packages/fleet/src/control/`) — the receiving-side counterpart to task 2's site-side telemetry emission.
  
  - `ingestTelemetry(signed, enrollmentStore, stateStore)` runs three independent checks, in order: (1) the claimed site is actually paired and not revoked (checked as its own condition, never folded into signature validity — a site paired before being revoked still holds a cryptographically valid keypair), (2) the signature genuinely verifies against that site's registered public key (task 1/2's Ed25519 primitive), (3) the payload is re-inspected on receipt with `assertNoForbiddenFields` — never trusted from the sender's own type system, since a compromised or buggy site is exactly the threat model this defends against. A rejection at any step never touches the state model — a partial, unverified update is worse than none. Returns a discriminated `IngestResult`, matching the `{ok:false, reason, ...}` shape this codebase has used consistently for every "here's exactly why" refusal this session (`@cogenta/channels`' link codes, `@cogenta/plugins`' registries).
  - `createSiteStateStore` persists one row per verified telemetry snapshot, keyed strictly per site — no query shape anywhere in this module spans more than one site's rows, structurally, not by convention. Real, bounded retention (30 most-recent snapshots per site, enforced on every write) per the lot's own "## Pièges connus" warning about unbounded telemetry growth — a real, testable property (deliberately over-inserting proves the oldest rows are genuinely pruned, not just excluded from a query), scoped per site so a busy site's volume never prunes a quiet site's history.
  
  No new `@cogenta/core` error codes — `ingestTelemetry`'s rejections are a typed discriminated result, not thrown errors, since a control plane needs to render "why" without parsing a message.

- [`ff275a1`](https://github.com/cogenta-cms/cogenta/commit/ff275a1cee00bd8ce1e1564381abf3cf109450d9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains inventory extraction and version-drift detection
  (`packages/fleet/src/inventory/drift.ts`), on top of task 3's per-site
  telemetry ingestion.
  
  - `extractInventory` flattens a real, already-verified `TelemetrySnapshot`'s
    `installedVersions` (cms/plugins/themes) into a uniform, component-oriented
    view — no new data source, a re-shaping of what already flows through
    ingestion.
  - `computeFleetBaseline` computes the real, most-common version per
    component across the currently-known fleet (never hardcoded); `detectDrift`
    reports every site whose version differs, classified `behind`/`ahead` via
    `@cogenta/plugins`'s real, already-tested semver comparator, or
    `different` when either side isn't parseable semver — never a guessed
    direction.
  - Honest scoping: `cms` is a real component kind in the shape, but every
    site reports `cms: null` today (no meaningful Cogenta version exists
    anywhere yet, same gap `@cogenta/plugins`' `loadPlugin` already documents
    for `engineCompatible`) — a component with no real version anywhere in
    the fleet produces no baseline entry and no drift entry, rather than a
    fabricated "0.0.0 vs 0.0.0" result.
  - `EnrollmentStore` gains `listSites()` — real, metadata-only (id/name/key/
    revocation state, never telemetry), the one legitimate fleet-wide seam
    needed to enumerate sites for drift detection and later tasks (dashboard,
    rollout campaigns) without touching `SiteStateStore`, which structurally
    has no cross-site query at all.

- [`eab13f0`](https://github.com/cogenta-cms/cogenta/commit/eab13f02f511b9bdfc886370c05f10bb62446c2a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package `@cogenta/fleet` — the multi-site fleet control plane (L8). This
  first task builds the pairing protocol: a real, single-use, time-limited
  enrollment token (`issuePairingToken`/`consumePairingToken`,
  `packages/fleet/src/enrollment/`), a real site registration recording the
  site's own Ed25519 public key at consumption time, and revocation.
  
  - Pairing tokens follow `@cogenta/auth`'s session-token shape (32 random
    bytes, base64url, stored SHA-256-hashed, never in the clear) rather than
    `@cogenta/channels`' shorter human-typed linking codes — a pairing token
    is copy-pasted into a site's own configuration, never hand-typed.
  - Reuses `@cogenta/plugins`'s real, already-tested Ed25519 primitives
    (`generateSigningKeyPair`/`signContent`/`verifyContentSignature`) as a
    new workspace dependency, rather than a second signing implementation —
    a real end-to-end test proves a signature made with a site's private key
    verifies against exactly the public key its pairing recorded, and fails
    against a different key or tampered content.
  - Consuming an already-used token, an unknown token, or an expired token
    each fail with a distinct, discriminated reason
    (`'already_used' | 'invalid' | 'expired'`) rather than a raw exception —
    the literal "rejeu de jeton d'appairage" security test this task's own
    acceptance criteria name.
  - Revocation is real and immediately checkable (`revokeSite`/`isRevoked`) —
    the primitive later tasks (a site's periodic contact loop, signed
    command retrieval) will refuse against.
  
  Not built in this task, deliberately: the site-side contact/polling loop,
  telemetry emission, and command retrieval — later tasks in this lot own
  those; this task is the pairing/key/revocation data layer they call.

- [`04abc78`](https://github.com/cogenta-cms/cogenta/commit/04abc787b197224f130faad22227d100d460c4f8) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains real risk scoring (`computeSiteRisk`/`rankSitesByRisk`, `packages/fleet/src/control/risk.ts`) and query helpers (`filterRisks`/`groupRisksByClient`) for L8 task 5, "Tableau de bord de flotte : tri par risque, pas par ordre alphabétique."
  
  - **Real inputs only**: the score weighs exactly the `TelemetryPayload` fields with a real data source today — open CVEs (by real urgency, a single critical CVE alone reaches the `critical` tier, matching the lot's literal acceptance criterion), admin-account MFA coverage, and version drift (task 4's `detectDrift`). Fields still "shape only" — availability, backups, certificate expiry, aggregated errors — contribute nothing; wiring their real data sources later just grows the weight table, no redesign.
  - A site with no telemetry at all is scored as real risk, not a clean zero.
  - Ranking is a real, deterministic sort (score descending, name ascending on ties) — proven by a test where the alphabetically-last site (a critical CVE) ranks first ahead of an alphabetically-first, merely-drifted site.
  - `filterRisks`/`groupRisksByClient` are real O(n) query functions designed for the lot's own "concevoir directement pour cent" warning, not a client-side afterthought.
  - `EnrollmentStore` (task 1) gains an optional `client` field on `issuePairingToken`/`SiteRegistration` — the one client/agency-grouping concept this package had nothing for before. `issuePairingToken`'s second parameter changed from a bare `ttlMs` number to an options object (`{ttlMs?, client?}`) — a breaking change to task 1's own not-yet-published API, updated at its one real call site.
  
  `@cogenta/admin` gains `FleetDashboard` (`packages/admin/src/fleet/dashboard.tsx`) — purely presentational and prop-driven (a local, structural `FleetSiteRisk` type, no hard dependency on `@cogenta/fleet`, matching `plugins/permission-review.tsx`'s established pattern), since no live fleet control plane is deployed anywhere yet. Renders whatever already-ranked list it's given — never re-sorts — with real search/client-filter/minimum-tier controls.

- [`0ed823c`](https://github.com/cogenta-cms/cogenta/commit/0ed823c5ff5e514178c9475b71f39a1023fba732) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains scheduled client reports: "## Rapports client"'s
  "Un rapport mensuel par site... C'est un livrable commercial pour l'agence,
  pas un tableau technique. Le format doit pouvoir être lu par le client
  final."
  
  - **Real fields vs. honest gaps**: `assembleClientReport` reads real data
    from tasks 2/3/4/5 (`openCves`, `coreWebVitalsAggregate`, version drift)
    and marks `availability`/`backups` as `{available: false}` — never a
    fabricated uptime percentage or backup date — matching `TelemetryPayload`'s
    own field-by-field honest scoping. `publishedContent`/`agentActions` are
    always `{available: false}`: no real fleet-visible signal for either
    exists anywhere in this codebase (no content-activity count on the
    telemetry payload — content data must never remonter at all, per the
    lot's own absolute rule; no live `AgentRegistry` anywhere, the same
    R2-honest finding repeated across L5/L7/L9/L8).
  - **Reuses `@cogenta/channels`'s real `buildReport`** (new workspace
    dependency) rather than inventing report rendering — `renderClientReport`
    produces a real `ReportChannelMessage`, so a report is immediately
    sendable through any real channel adapter (Telegram/Slack/Discord/email)
    already built in L6, matching "envoyé sur le canal choisi ou par email"
    literally. `buildReport`'s own real screen-budget enforcement caught an
    overlong first draft during this task's own testing — sections were
    tightened, not bypassed with a `moreUrl` to a dashboard that doesn't
    exist yet.
  - **Plain language, no raw identifiers**: a dedicated test asserts the
    rendered output never contains a raw CVE id or a raw semver string —
    same technique L7's `describeCapability` used for its own "no raw
    identifier" acceptance criterion.
  - **`isReportDue`/`createReportScheduleStore`**: a real, injectable-clock
    30-day cadence check plus real, per-site "last sent" persistence — no
    live cron wired (no live control-plane deployment exists anywhere in this
    lot, the same honest scoping every prior L8 task has made), but the real
    due/not-due computation and its real storage are both real and tested.

- [`d9e4562`](https://github.com/cogenta-cms/cogenta/commit/d9e45627c2d440fb9d80706213f19fdf8e673158) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains the control-plane-to-site command channel: "## Appairage"'s
  "Les commandes du plan de contrôle vers un site sont récupérées par le site lors de
  son prochain contact, signées, et exécutables uniquement dans une liste blanche
  d'actions."
  
  - **A closed action whitelist** (`FLEET_COMMAND_ACTIONS`: `update`, `rollback`) — named
    now, ahead of tasks 7/8's real execution logic, so this is the real, non-bypassable
    transport/verification layer those tasks plug handlers into, not a whitelist widened
    later under a design already shipped.
  - **`createCommandQueueStore`**: real, persisted, strictly per-site command queue
    (`enqueue`/`fetchPending`) — fetching signs each pending command with the control
    plane's own real Ed25519 private key and marks it delivered, so a site's next fetch
    never re-sees it.
  - **A real control-plane identity** (`ControlPlaneIdentity`, `packages/fleet/src/control/identity.ts`)
    — distinct from any site's own keypair. A site signs telemetry with ITS key
    (verified by the control plane); the control plane signs commands with ITS OWN key
    (verified by the site) — two independent keypairs, two independent verification
    directions, never the same key checked both ways. `EnrollmentStore.issuePairingToken`
    now hands the control plane's public key to a site at pairing time
    (`PairingToken.controlPlanePublicKey`), and `getControlPlanePublicKey()` exposes it
    directly.
  - **`verifyFleetCommand`/`dispatchFleetCommand`** (site side): checks the whitelist
    FIRST — an action outside it is refused even with a perfectly valid signature, since
    signature validity alone must never be sufficient to authorize an action a site
    doesn't recognise. A rejected command never reaches a handler; a whitelisted,
    validly-signed command with no registered handler is refused too, never silently
    ignored.
  - Scoping: this task verifies and dispatches; marking a command "delivered" happens on
    fetch (preventing infinite re-delivery), but "executed successfully" bookkeeping is
    left to the real update/rollback logic tasks 7/8 will build.

- [`3237b0e`](https://github.com/cogenta-cms/cogenta/commit/3237b0e314b3e71a0a7a9e1b4eb7370814f5611c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains per-site rollback, completing what task 7's canary-wave
  rollout started: "## Mises à jour groupées"'s "Un échec arrête toute la
  campagne et propose le retour arrière du site concerné."
  
  - **Propose, not act**: "propose" is read literally — a halted campaign never
    auto-enqueues a rollback by itself (an unattended automatic rollback of what
    might be a real but transient contact failure is a real operational risk
    the lot's own words don't ask for). `listRollbackCandidates(campaignStore,
    campaign)` is the real, queryable "propose" half: for a `halted` campaign,
    one entry per real failed site (`CampaignRecord.failedSiteIds`, task 7),
    each carrying the real version that site reported immediately before the
    campaign touched it (`RolloutCampaignStore.getSiteRolloutRecords`, a new
    real read path over task 7's own `pre_update_version` history — not
    `SiteStateStore`'s general drift-tracking, which has no concept of "before
    THIS campaign"). Returns `[]` for anything not halted.
  - **`triggerRollback`**: the real, separate, deliberate act — enqueues a real,
    signed `rollback` command (task 6's real command queue) for exactly one
    site, strictly per-site (no "roll back the fleet" operation exists, per the
    lot's own words: "il n'existe pas d'état global à restaurer"). Refuses
    (`FLEET_ROLLBACK_NO_PRIOR_VERSION`) when no real prior version is known —
    never rolls back to a fabricated default. Callable standalone, independent
    of any campaign, for an operator manually deciding a specific site needs to
    go back.
  - **Site-side handler** (`createRollbackIntentHandler`): registers the real
    `rollback` whitelisted action (task 6) — verifies the payload shape, then
    hands it to a caller-supplied callback. Honest scope: no mechanism exists
    anywhere in this codebase to revert a site's installed plugin/theme/CMS code
    to a prior version (no package-manager integration, no `@cogenta/plugins`
    downgrade path) — this is a real, documented gap, not a handler that
    pretends to act. `recordIntent` is where a real deployment wires whatever
    it actually has.
  - **Acceptance criterion resolved without new code**: "Un site peut être
    détaché de la flotte et continuer à fonctionner seul" was already true
    structurally since task 1 — no core CMS package (`@cogenta/schema`,
    `@cogenta/render`, `@cogenta/api`, `@cogenta/cli`, `@cogenta/auth`,
    `@cogenta/blocks`, `@cogenta/theme-canonical`) has ever depended on
    `@cogenta/fleet`. A new real test asserts this against every core
    `package.json` directly, rather than leaving it an assumption.
  
  One new `@cogenta/core` error code: `FLEET_ROLLBACK_NO_PRIOR_VERSION`.

- [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `@cogenta/fleet` gains site-side telemetry emission (`packages/fleet/src/agent/`) — the closed, honest shape of what a site is allowed to send to the control plane, per the lot's own "## Ce qui remonte, et ce qui ne remonte pas."
  
  - `TelemetryPayload` is a closed type: only the fields the lot doc names
    (`installedVersions`, `sbomFingerprint`, `openCves`, `coreWebVitalsAggregate`,
    `availability`, `backups`, `certificateExpiry`, `adminAccounts`,
    `aggregatedErrors`) exist on it — no `content`/`media`/`memory`/`logs`
    field is representable at all. `sbomFingerprint`, `openCves`,
    `coreWebVitalsAggregate` and `adminAccounts` are wired to real, existing
    data sources in this codebase (`@cogenta/agents-builtin`'s security/
    performance agents, `@cogenta/auth`'s real user/credential model); the
    rest are honest shape-only placeholders — no real backup mechanism,
    certificate-expiry check, uptime monitor, or error-aggregation sink
    exists anywhere yet, and this task does not fabricate one.
  - `assertNoForbiddenFields` is a real, defense-in-depth runtime scan for the
    same forbidden list, catching a leak past a loosely-typed call site that
    TypeScript alone wouldn't stop — the literal "vérification exhaustive de
    ce qui sort d'un site" security test the lot names.
  - `signTelemetryPayload`/`verifyTelemetrySignature` reuse `@cogenta/plugins`'
    generalized Ed25519 primitive (task 9/12) — the same one L8 task 1's
    pairing already uses — and refuse to sign a payload carrying a forbidden
    field at all, rather than catching it only closer to the network boundary.
  - `fingerprintSbom` hashes the real SBOM via the same canonical, sorted-key
    content-signing helper, with a real bug fixed during this task's own
    testing: `canonicalizeContent` sorts object keys but not array element
    order, so two functionally-identical SBOMs built from a `dependencies`
    record whose keys simply iterate in a different order would otherwise
    fingerprint differently — the entries are now sorted by name before
    canonicalizing.
  
  One new `@cogenta/core` error code: `FLEET_TELEMETRY_FORBIDDEN_FIELD`.

### Patch Changes

- [`31ee6a0`](https://github.com/cogenta-cms/cogenta/commit/31ee6a017e62324250e9ee1df9fc2486b36e9043) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add cross-site isolation tests (L8 task 11, the lot's own last task): a
  dedicated adversarial suite that turns "always scoped to exactly one
  siteId" — documented on every per-site store since the task that first
  built it — into a checked fact rather than an assumption. Covers
  `SiteStateStore`, `CommandQueueStore`, `AlertConditionStore`,
  `ReportScheduleStore` and `RolloutCampaignStore.getSiteRolloutRecords`, plus
  the ingestion boundary's real cross-site impersonation attempt: a genuinely
  paired site's own valid signature over a payload claiming another site's
  identity is refused, because verification checks the CLAIMED site's
  registered public key, never the actual signer's. A 100-site load test
  (`## Tests exigés`'s "100 sites simulés") re-proves the same zero-contamination
  property at the lot's real target fleet scale through the real signed
  ingestion path.
  
  `@cogenta/agents`'s `MemoryStore` site isolation is deliberately not
  duplicated here — its own contract test already proves it where the memory
  actually lives, and `@cogenta/fleet` has no reachable path to agent memory
  today (no live `AgentRegistry` exists anywhere in this codebase).
  
  No production code changed — this closes L8's last task, and with it the
  entire planned lot roadmap.
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`ec28342`](https://github.com/cogenta-cms/cogenta/commit/ec2834226f36cbf8d54e4be8854ea05ae0e1feae), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`fd66dbc`](https://github.com/cogenta-cms/cogenta/commit/fd66dbce1d2e674e62e13eaec488ae85ee745e32), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`4ba88c1`](https://github.com/cogenta-cms/cogenta/commit/4ba88c10d9b1e0ba02107f7ba3cd6f56cfedaac5), [`835fe81`](https://github.com/cogenta-cms/cogenta/commit/835fe81bad7678bb8f9c68c98dba2767c07f67ba), [`b45ee25`](https://github.com/cogenta-cms/cogenta/commit/b45ee25b22687adbb1364017d9b09492edf645ff), [`765b588`](https://github.com/cogenta-cms/cogenta/commit/765b588ae2aa899d6496da26c22dc0af3e572185), [`9bf5e7b`](https://github.com/cogenta-cms/cogenta/commit/9bf5e7b08ae414f1ced40ebbd0ad77143ac88102), [`71a3b7f`](https://github.com/cogenta-cms/cogenta/commit/71a3b7f34faee420bc850f3666188de5a3362204), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ef204b`](https://github.com/cogenta-cms/cogenta/commit/6ef204b9abdc035673f58c6b23511184c0025bef), [`4cdac7b`](https://github.com/cogenta-cms/cogenta/commit/4cdac7b14fda33d071d68bd9780be33df974700e), [`5f61177`](https://github.com/cogenta-cms/cogenta/commit/5f61177cc4f4accc736a494d6e72f25b84641a51), [`81b1514`](https://github.com/cogenta-cms/cogenta/commit/81b1514e64282eeb5d6a37930f04f0a956e35f6f), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`6fa45e8`](https://github.com/cogenta-cms/cogenta/commit/6fa45e820eeb7c6d34a57755688dbbdb2abec471), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/channels@0.1.0
  - @cogenta/agents-builtin@0.1.0
  - @cogenta/plugins@0.1.0
