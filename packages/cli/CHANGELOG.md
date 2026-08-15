# @cogenta/cli

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
