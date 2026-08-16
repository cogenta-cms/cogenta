# @cogenta/schema

## 0.2.0

### Minor Changes

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

- [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Breaking: contract A moves to `schema@2.0`** (ADR-0022) — the trash and native
  taxonomies, in one version bump with one migration.
  
  ### `delete()` changed meaning without changing signature
  
  `ContentStore.delete()` no longer issues a `DELETE`. It writes the new system
  field `deletedAt` and leaves every row where it was — versions, blocks, join
  rows, and the `translation_of` of any translation. Two new methods complete it:
  
  - `purge(id)` is the real `DELETE`, i.e. what `delete()` used to do;
  - `untrash(id)` takes an entry back out, with the status it went in with;
  - `purgeExpired()` removes what has outlived the collection's `trash.retainDays`.
  
  **How to migrate.** Code that called `delete()` to genuinely destroy a row — an
  import script that cleans up, a test that resets — must now call `purge()`.
  Nothing will fail loudly if you do not: the call still succeeds and simply
  leaves the row behind, which is the worst kind of break and the reason it is
  called out first here. `trash: false` on a collection restores the old
  behaviour outright.
  
  ### Every read now filters the trash by default
  
  `read`, `list`, `translations`, `resolveLocale` and `history` exclude trashed
  entries unless the caller passes `trashed: 'include' | 'only'`. That direction
  is deliberate: a renderer, a sitemap or a headless client written against 1.0
  keeps serving live content with no change at all.
  
  ### `restrict` is now enforced in application code
  
  Trashing is an `UPDATE`, so a foreign key can no longer refuse it. `delete()`
  checks referring entries itself and names what blocks ("2 entries of
  \"article\" still reference it"); `purge()` runs the same check so both paths
  give the same sentence. This needs the sibling collections, so
  `createContentStore` takes a new optional `siblings` option — **pass it**. Left
  out, only self-references are checked; nothing is destroyed, since `purge()`
  still meets the real foreign key, but a trash that should have been refused
  will be allowed.
  
  `withReadOnlyStore` refuses `delete`, `untrash`, `purge` and `purgeExpired`.
  
  ### Native taxonomies
  
  `defineTaxonomy()` is a second top-level declarable object beside
  `defineCollection()`, and `f.taxonomy({ of, many })` a new field kind. A term
  carries `id`, `parent`, `slug`, `position` and `labels` indexed by locale, and
  deliberately no `status`, `version` or `translationOf`: a classification is not
  content, so ADR-0014 does not govern it.
  
  The tree is stored as a **materialised path** maintained on write, never a
  recursive CTE: "everything under this term" is one `like` that Postgres,
  MySQL/MariaDB and SQLite answer identically (ADR-0006). Paths are built from
  ids, so renaming a term rewrites nothing and only a move pays. Nesting is
  bounded at 12 levels so the indexed column stays inside InnoDB's key limit.
  
  `createTaxonomyStore()` is the term store; `createSchemaTables(db, collections,
  taxonomies)` and `dropSchemaTables` take the taxonomies as a third argument.
  
  ### The migration
  
  `schema2Migration({ collections, taxonomies })` adds `deleted_at` to every
  entry table and creates the terms and join tables. It is marked **destructive**,
  so the migrator demands an explicit confirmation and a verified backup: its
  `down` drops `deleted_at` and the terms tables, which permanently discards
  everything in the trash and every classification — entries sitting in the trash
  silently become live again with no record they were ever deleted.
  
  ### Also
  
  `.cogenta/schema.json` reports `schema@2.0`, carries the declared taxonomies and
  each collection's trash window, and `buildSchemaDocument`/`renderSchemaJson`
  take the taxonomies. `@cogenta/core` gains the error codes the two features
  need: `CONTENT_REFERENCED`, `CONTENT_NOT_TRASHED` and the `TAXONOMY_*` family.

- [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `ContentStore` gains `duplicate(id, input?)`: it copies an entry's values,
  relations and block zones into a brand-new draft (L13 task 4). No contract A
  change — it composes `read` and `create`, and duplication is covered by the
  already-frozen `create` action, so no sixth permission action was invented.
  
  Four behaviours are decisions rather than defaults, and each is tested:
  
  - **The copy always starts its own translation family** (`translationOf` is
    null even when the source is itself a translation). Two rows of the same
    family sharing a locale would make `resolveLocale` choose between them
    arbitrarily — it returns the first match — and would list the copy in
    `translations()` as if it were another language.
  - **A unique field gets a derived, free value** (`sido` → `sido-copy` →
    `sido-copy-2`), probed inside the same transaction as the insert. Without
    it the first duplicate of the commonest collection shape there is — an
    article with a unique slug — would fail on a raw unique-index violation. A
    unique field that is not text cannot be derived, and refuses with
    `CONTENT_INVALID` naming the field instead of guessing.
  - **Copied blocks get fresh `_key`s.** A key anchors comments and RAG chunks;
    the same key in two entries would make a key alone meaningless as an anchor.
  - **Provenance is carried over, not reset to `human`.** Duplicating generated
    content does not make it human-written. Pass `provenance` to say otherwise.
  
  `publishedAt` is always cleared, the copy is always a `draft` at version 1
  with its own empty history, and it copies the **working** state — what the
  editor is looking at — not the published version underneath.
  `withReadOnlyStore` refuses `duplicate` like every other mutation.

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

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0

## 0.1.0

### Minor Changes

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the core of `@cogenta/schema`: `defineCollection`, the fourteen field types of
  contract A, the system fields, and the two generated artefacts.
  
  `f.text()`, `f.richText()`, `f.slug()`, `f.number()`, `f.boolean()`, `f.date()`,
  `f.datetime()`, `f.media()`, `f.relation()`, `f.select()`, `f.json()`, `f.geo()`,
  `f.color()` and `f.blocks()` each produce a plain, serialisable field definition and a
  Zod validator derived from it — one validator, generated from the schema, never a second
  one written by hand next to it.
  
  `defineCollection` checks a definition at import time and reports **every** problem at
  once, each located by the field it concerns (`fields.author.onDelete`,
  `indexes[0]`, `routing.pattern`), rather than one per run. A default value the field
  itself would reject, a slug derived from a field nobody declared, `'setNull'` on a
  required relation, an action outside the five of the contract: all refused before a
  migration exists.
  
  `renderTypeDeclarations()` produces `.cogenta/types.d.ts` — one interface per collection,
  extending the system fields, importing nothing so a theme compiles against it without
  depending on the schema package. A theme reading a field that no longer exists now fails
  to build, which is the acceptance criterion of L1. `renderSchemaJson()` produces
  `.cogenta/schema.json`, the description the admin reads. Both are pure functions
  returning strings; the CLI writes the files.
  
  `richText` stores the restricted Portable Text document of ADR-0013 — no HTML, no `h1`,
  internal links referencing an entity rather than a URL — and rejects a mark that no
  `markDefs` entry defines or two nodes sharing a `_key`. Ids are application-minted
  UUIDv7 (ADR-0015), monotonic inside a millisecond so they stay ordered.
  
  Core gains the `SCHEMA_INVALID` error code.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add slugs, routing, automatic 301 redirects and scheduled publication to `@cogenta/schema`.
  
  **Slugs.** `slugify` transliterates with `normalize('NFD')` and a written-down table for
  the letters Unicode does not decompose — "ß", "æ", "ø" — so it needs no dependency and no
  data file. `deriveSlug` reads the source named by `f.slug({ from: 'title' })`, keeps a
  slug the editor typed by hand, and resolves collisions with a `-2`, `-3` suffix that
  stays inside the length budget rather than growing past the column width. Uniqueness is
  scoped **per collection and per locale**, which is what ADR-0014 implies: the French and
  the English article are two entries, and both are legitimately `/mon-article` under their
  own prefix.
  
  **Redirects.** Changing the slug of a **published** entry now writes a 301 with nobody
  asking for it, and the table is listable, filterable and deletable. Two properties are
  enforced at write time rather than left to whoever reads the table later:
  
  - chains are flattened — renaming a page twice leaves one hop, not two, so a visitor
    never pays for the site's edit history;
  - loops are refused with `CONTENT_REDIRECT_LOOP`, and moving a page back to its old URL
    is expressed as `release()` rather than as a cycle the store quietly repairs.
  
  A draft that changes slug records nothing: nobody could reach the old URL, and a redirect
  from an unreachable path is a row that only ever confuses.
  
  **Routing.** `matchPath` resolves a URL against `routing.pattern`, with or without the
  locale prefix, and `buildPath` goes the other way. `resolveUrl` answers `entry`,
  `redirect` or `notFound` — content first, redirects second, so a stale rule can never
  shadow a page that is live.
  
  **Scheduled publication.** An entry in `status: 'scheduled'` becomes a job in the L0
  queue, and the whole module is written against `QueueDriver` and nothing else. It
  therefore works on the `database` queue — the driver with no worker of its own, drained
  by a cron calling `tick()`. On a cron every five minutes, a page scheduled for 09:00 goes
  live between 09:00 and 09:05; that is the honest promise of a host without a worker, and
  the handler logs the lateness so the question can be answered when it is asked. An entry
  whose hour passed while the site was down publishes on the next tick instead of being
  skipped.
  
  `@cogenta/core` gains five error codes for the above: `CONTENT_SLUG_INVALID`,
  `CONTENT_SLUG_TAKEN`, `CONTENT_ROUTE_INVALID`, `CONTENT_REDIRECT_LOOP` and
  `CONTENT_SCHEDULE_INVALID`. Adding a code is a minor change; no existing code changed
  meaning.

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the content persistence layer: typed CRUD, drafts, versions, diff and i18n, portable
  across Postgres, MySQL, MariaDB and SQLite.
  
  `createContentStore({ db, collection })` gives a collection its create/read/update/
  delete/list, plus `publish`, `unpublish`, `history`, `readVersion`, `restore`, `diff`,
  `translations` and `resolveLocale`. `createSchemaTables(db, collections)` builds the
  physical schema the store expects — the same DDL the migration generator will emit, so
  the two cannot drift.
  
  The entry table holds the **live** state, which is what the public renderer reads. With
  `versioning.drafts`, editing a published entry writes a version row and leaves the live
  row alone: a draft is unreachable through `read(id)` because it is not there, not
  because a filter remembered to exclude it. Publishing moves the live row onto the
  working version. `versioning.keep` bounds the history, and the live version is never
  pruned.
  
  Pagination is by keyset cursor, never by offset: a cursor is the sort value and the id of
  the last row handed out, so entries inserted concurrently cannot shift a window and make
  a reader see the same entry twice or miss one. A cursor taken under one ordering is
  refused under another.
  
  Identifiers are UUIDv7 minted by the application (ADR-0015) — no `RETURNING`, no
  `insertId`, and content keeps its identity across dev, staging and production. Blocks are
  one row each, ordered, with a stable `_key` (contract A), so "which pages use this
  medium", cache-tag invalidation and per-block RAG chunking stay possible. Content is one
  entry per language (ADR-0014): `status`, `publishedAt` and `version` are per language,
  and a missing locale renders through one of three explicit strategies — show the
  original, hide it, or report it missing.
  
  Core gains three error codes — `CONTENT_NOT_FOUND`, `CONTENT_INVALID` and
  `CONTENT_CONFLICT` — so the content layer reports what failed with a code callers can
  branch on, instead of borrowing `CONFIG_INVALID` for an editor's mistake.

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

### Patch Changes

- [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/auth` — passwords, TOTP, WebAuthn passkeys, opaque sessions, progressive
  login rate-limiting, and a hash-chained audit log, tested against a real SQLite database
  (no mocked database, per AGENTS.md).
  
  Passwords use `scrypt` from `node:crypto` at the OWASP floor (N=2^15), never bcrypt or
  argon2 — both are native modules R10 forbids without a WASM fallback, and neither ships
  one. TOTP (RFC 6238) is hand-written, forty lines of unambiguous HMAC; WebAuthn is a
  justified dependency (`@simplewebauthn/server`, MIT, pure JS) because attestation
  verification is a large, security-relevant surface no homegrown subset should touch.
  
  MFA is mandatory, not configurable, for the `admin` role and for any role a collection
  grants `publish` to — computed from `CollectionDefinition[]`, so it tracks the schema
  rather than a setting someone can switch off under deadline pressure. A short-lived
  HMAC-signed ticket (the same shape as a preview grant) carries a verified password step
  into the second-factor step without server-side state.
  
  Sessions are opaque random bearer tokens, stored hashed like a password, sliding TTL —
  never a JWT, so "sign out of every device" is a real revoke rather than a wait for
  expiry. The audit log is append-only and hash-chained; `verify()` detects a row edited or
  deleted outside of `record()`, and this table is built to take a second writer once L4's
  agents need to log to the same place.
  
  `newId`/`isUuidV7`/`timestampOf` move from `@cogenta/schema` to `@cogenta/core`, since
  `@cogenta/auth` now needs them too; `@cogenta/schema` re-exports them unchanged.

- [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fixes a silent export collision: two unrelated types were both named
  `ContentBlock` in `@cogenta/schema`'s public surface — the store's
  `key`/`type`/`data` row shape (`store/types.ts`, backing `BlockZones` and
  `ContentEntry`), and the raw `_key`/`_type` wire-validation shape a `blocks`
  field write is checked against (`validation.ts`). Because an explicit named
  export wins over an `export *` re-exporting the same name, the validation
  shape silently shadowed the store shape — any consumer importing
  `ContentBlock` got the wire shape, with no way to reach the store shape
  under that name at all.
  
  The validation shape is renamed `RawBlockInput`. `ContentBlock` now
  unambiguously refers to the store's row shape, matching what `BlockZones`
  and `ContentEntry` already exposed. No wire or storage shape changed — this
  is a TypeScript type-alias rename only, and no consumer in this workspace
  was importing the shadowed name (`packages/admin`, `packages/render` and
  `packages/import` each already used their own local, structurally
  equivalent type rather than this ambiguous export).
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
