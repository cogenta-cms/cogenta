# @cogenta/cli

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
