# @cogenta/api

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
