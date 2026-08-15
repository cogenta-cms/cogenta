# create-cogenta

## 0.1.5

### Patch Changes

- [`89bfa96`](https://github.com/cogenta-cms/cogenta/commit/89bfa960c4f6aa63e8607e8dfeaa25be4ab89576) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix the blog blueprint's home page failing every real query with
  `QUERY_INVALID`.
  
  Its `collectionList` block sorted recent posts by `publishedAt` — a real
  system field, but nullable (a draft has none) and never part of the real,
  frozen `SortField` union (`id`/`createdAt`/`updatedAt` only; cursor
  pagination needs a column that is never null). Every other blueprint
  already sorted by `createdAt`; blog was the one exception, and nothing
  exercised its `collectionList` block through the real gateway until
  `cogenta serve`'s new theme-render fallback did (see the `@cogenta/cli`
  changeset) — the existing render test built its own query by hand instead
  of going through the block's real `query()` function, so it never caught
  this. Now sorts by `createdAt`, same as every other blueprint.

- [`e903fac`](https://github.com/cogenta-cms/cogenta/commit/e903fac9491fadd3ac37399bec7c4f199b244f96) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `npx create-cogenta`'s own "Next step" instructions being incomplete.
  Scaffolding writes a real `package.json` with real `@cogenta/*` dependencies
  but never installs them — a deliberate scope boundary (no network call
  during scaffold), but the printed next step went straight to
  `npx cogenta serve` without `npm install` first, so the very first thing a
  new user typed failed with a confusing `npm error 404 ... 'cogenta@*'`
  (npx, finding no local `cogenta` binary and no scoped package name, tried to
  fetch a package literally named `cogenta` from the registry — which has
  never existed; the real package is `@cogenta/cli`, whose `bin` happens to be
  named `cogenta`). Found via a real `npx create-cogenta@latest` from the
  actual npm registry, on a machine with no local install of this repo.

- [`7ff79a2`](https://github.com/cogenta-cms/cogenta/commit/7ff79a260f97c79192553e88e2e7e4d22e0d8965) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The installer's recap now tells you where to actually sign in: "Then open
  <site-url>/admin and sign in with the admin account above." Previously it
  only mentioned enrolling a passkey, with no mention of a URL — a real
  onboarding blocker once `cogenta serve` gained the ability to serve the
  admin SPA (see `@cogenta/cli`'s own changeset).

- [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Scaffolding now writes a real, randomly generated `COGENTA_AUTH_SIGNING_KEY`
  into a `.env` file next to `cogenta.config.mjs` (`randomBytes(32)`, base64),
  plus a `.gitignore` covering `node_modules/`, `.env` and `.cogenta/`. Paired
  with `@cogenta/core`'s new `.env` auto-loading (its own changeset), this
  removes a real onboarding blocker: a brand-new user previously had to find,
  run and correctly `export` a key-generation command themselves — with no
  guidance on the Mac/Windows/Linux differences — before `cogenta serve` would
  even start. `npm create cogenta` now produces a site that runs with zero
  manual secret-handling steps.
- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`7ff79a2`](https://github.com/cogenta-cms/cogenta/commit/7ff79a260f97c79192553e88e2e7e4d22e0d8965), [`cb69cab`](https://github.com/cogenta-cms/cogenta/commit/cb69cab09b89d3cc5b8d15f5887ec93f82e32599), [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/cli@0.2.0
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/render@0.1.2
  - @cogenta/schema@0.1.2
  - @cogenta/theme-canonical@0.1.2

## 0.1.0

### Minor Changes

- [`1430cdd`](https://github.com/cogenta-cms/cogenta/commit/1430cdd17bfecf0b2764226814afe0fca287fc71) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the `blog` blueprint's page types (L9 task 4): a `page`
  collection (`title` + a real block zone, routed at `/:slug`), formalising the
  title-plus-blocks shape `theme-canonical`'s own test fixtures already used for
  internal-link targets. Two demo pages are seeded through the real
  `ContentStore` alongside the existing posts/categories/tags: `home` (a `hero`
  block plus a `collectionList` of recent posts) and `about` (a `prose` bio) —
  both rendered generically by `@cogenta/theme-canonical`'s existing
  `renderPage`/`renderBlock`, with no new rendering code required.
  
  Investigation found the block-composition and single-entry URL routing
  (`@cogenta/schema`'s `matchPath`/`buildPath`) already generic across any
  collection with a `routing.pattern`; what did not exist anywhere yet was an
  actual runnable site (no `src/pages/`, no Astro scaffold) to invoke either —
  building that is out of this task's scope and is called out honestly rather
  than invented.

- [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the `blog` blueprint (L9 task 3): `post`/`category`/`tag`
  collections, real demo content seeded through `ContentStore`, the canonical
  theme's default skin (`theme.tokens.json`), and a recommended-agents hint
  (`.cogenta/recommended-agents.json`) — no live agent scheduler is wired,
  since none exists anywhere in this codebase yet (R2). `resolveBlueprint`
  now genuinely resolves `blog` as available; `blank`'s output is unchanged.
  
  Also fixes a bare `throw new Error(...)` in `resolveBlueprint`'s internal
  consistency check, replaced with a `CogentaError`.
  
  One new `@cogenta/core` error code: `BLUEPRINT_REGISTRY_CORRUPT`.

- [`d321a40`](https://github.com/cogenta-cms/cogenta/commit/d321a4006037a3fc1e1ec273621c97422331ad7b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `create-cogenta`, the `npm create cogenta` installer wizard (L9 task 1):
  environment check, site/blueprint/database/LLM prompts (or `--yes` /
  `--config <file>` for a non-interactive install), a real API-key validation
  round trip when an LLM provider is configured, and scaffolding that writes a
  loadable `cogenta.config.mjs` and genuinely runs migrations plus the first
  admin-user creation against a real SQLite database by reusing
  `@cogenta/cli`'s own `runMigrate`/`runUsers`.
  
  The blueprint menu lists one working entry (`blank`) plus eight named,
  visibly-disabled "coming soon" entries; picking one of those falls back to
  `blank` and always says so, never silently. AI skin generation and passkey
  enrollment are out of scope for this task and are deferred to later work —
  the recap says so explicitly rather than fabricating either.

- [`9463f49`](https://github.com/cogenta-cms/cogenta/commit/9463f49960100468e8c50610fc5aae0428651d49) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the final four blueprints (L9 task 8, batch B of two —
  task 8 is now fully complete):
  
  - **`magazine`**: `article` (title/excerpt/section/body, routed at
    `/articles/:slug`) grouped by a `section` select field rather than a
    second category collection; `home` (hero + a live list of recent
    articles) and `about` (prose).
  - **`association`** (nonprofit): `event` (title/date/location/description,
    routed at `/events/:slug`); `home` (hero + mission prose + a live
    upcoming-events list + a donate `cta`) and `mission` (prose + a static
    `stats` impact summary).
  - **`restaurant`**: `menu_item` (name/description/price/category, routed at
    `/menu/:slug` so the home page's live menu list can link to each item,
    even though nothing else deep-links to one yet); `home` (hero + a live
    menu highlights list) and `contact` (prose with hours and location as
    plain text — no dedicated field kind exists or is warranted for two
    lines).
  - **`saas`**: `feature` (name/description, routed at `/features/:slug`);
    `home` (hero + a live features grid + a signup `cta`) and `pricing`
    (prose + a static `stats` row). Deliberately no `pricingPlan` collection:
    page-authored pricing numbers have no independent lifecycle worth a
    second collection.
  
  All four reuse the `BlueprintContentPack` extension point and the shared
  `definePageCollection` helper, exactly like batch A. `resolveBlueprint` now
  resolves every blueprint named in the lot doc as available — `blank` is the
  only one left without a content pack, by design.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — AI skin generation with hard-refusal validation (L9 task
  7). When an LLM provider is configured with a valid key and a free-text site
  description is given, the `blog` blueprint's `theme.tokens.json` is generated
  from that description instead of copying the theme's default: the model is
  asked for contract D's token JSON only (never CSS), and every candidate is
  checked by `@cogenta/render`'s existing `validateSkin` — reused wholesale,
  not reimplemented — in hard-refusal mode (AA contrast on every pair, a
  strictly monotone type scale, the full closed token set, `motion.reduced`).
  On a rejection, the thrown `CogentaError`'s `message`/`hint` become the next
  attempt's correction prompt, for three attempts. A successful candidate is
  rendered on three real preview pages (through the same generic
  `renderPage`/`renderBlock` pipeline a live site uses) written to
  `.cogenta/skin-preview/`, and the installer offers accept, regenerate, or
  fall back to the default — bounded so a non-interactive `--yes`/`--config`
  run never loops. Every outcome — generated and accepted, regenerated,
  fallen back after failed validation, or never offered — is reported by name
  in the install recap; nothing is silent.
  
  Scoped to the `blog` blueprint only, the one blueprint that writes a
  `theme.tokens.json` today. Regenerating a skin after install (`cogenta skin
  generate`) is explicit CLI surface the lot doc lists under a later task (L9
  task 9) and is not built here.
  
  One new `@cogenta/core` error code: `SKIN_GENERATION_RESPONSE_NOT_JSON`, for
  a model response that is not a single JSON object.

- [`68ba583`](https://github.com/cogenta-cms/cogenta/commit/68ba5833a11911a5b7690886792531c2092a77d9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — three more blueprints (L9 task 8, batch A of two):
  
  - **`vitrine`**: a one-pager business showcase. `service` (routed at
    `/services/:slug`, so a `collectionList` block can safely link to each
    one) and `testimonial` collections; `home` (hero + live services grid +
    cta) and `about` (prose + two `quote` blocks mirroring the seeded
    testimonials — a testimonial has no page of its own worth linking to, so
    it is not queried live like `service`).
  - **`portfolio`**: `project`, routed at `/work/:slug`; `home` (hero + a live
    project grid) and `about` (prose + a static `stats` block).
  - **`documentation`**: `doc_page` (title/section/order/body, routed at
    `/docs/:slug`) is the "pages types" for this blueprint directly, plus one
    `page` entry (`home`) linking into a live list of doc pages — the most
    different of the three in spirit: reference material, not marketing.
  
  All three reuse the `BlueprintContentPack` extension point introduced
  alongside them (previous commit) and a new shared `definePageCollection`
  helper (`content-pack.ts`) for the `title`/`slug`/`blocks` shape `blog`'s
  own `page` collection already had — the third and later real usages of
  that exact shape, per AGENTS.md's "not before three real usages"; `blog.ts`
  itself is left untouched.
  
  `resolveBlueprint` now resolves `vitrine`, `portfolio` and `documentation`
  as available. Four blueprints remain for a second batch: magazine,
  association, restaurant, SaaS.

### Patch Changes

- [`44e4ec6`](https://github.com/cogenta-cms/cogenta/commit/44e4ec60171a4d9ca4fb9bd13172294cb4260994) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Internal refactor: generalizes the `blog` blueprint's hardcoded
  `blueprint.id === 'blog'` scaffolding branch into a `BlueprintContentPack`
  extension point (`packages/create-cogenta/src/blueprints/content-pack.ts`,
  `content-packs.ts`) — a blueprint's collections, recommended agents and
  demo-content seeding are now looked up generically by id. No behavior
  change for `blog` or `blank`; this is preparation for L9 task 8 (the seven
  remaining blueprints), each of which now only needs to add its own content
  pack and a registry entry rather than another branch in `scaffold.ts`.

- [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 9: real CLI surface for `generate types` and `skin list/validate/apply/generate`, plus `cogenta dev` as an alias for `cogenta serve`.
  
  `generate types` is a thin wrapper around `@cogenta/schema`'s existing `renderTypeDeclarations`, writing to `.cogenta/types/schema.d.ts` by default. `skin list/validate/apply` are thin wrappers around `@cogenta/render`'s existing `validateSkin`/contract-D token groups — `apply` never writes a skin that fails validation.
  
  `skin generate`'s underlying logic (`generateSkin`, the LLM→JSON→validate→retry-on-hint loop built for `create-cogenta`'s L9 task 7) is relocated from `create-cogenta` to `@cogenta/agents` (`@cogenta/agents`'s `generateSkin`/`GenerateSkinOptions`/`GenerateSkinResult`) so both the installer and `@cogenta/cli` can call the same implementation without either depending on the other — `@cogenta/agents` gains a dependency on `@cogenta/render` (the schema/validation it generates against), not the other way around. `create-cogenta`'s `skin-flow.ts` now imports `generateSkin` from `@cogenta/agents`; no behavior change.
  
  `build`, `backup`, `upgrade`, `deploy`, `theme`, `agent`, and `generate schema`/`generate migrations` remain unbuilt — none has a real underlying capability to wrap yet (no Astro build wiring, no backup/restore mechanism, no deploy-target concept, no theme registry, no live `AgentRegistry` anywhere in the codebase, no schema-diff-to-migration generator). `cogenta <command>` for any of these falls through to the existing unknown-command usage message rather than a stub — see CLAUDE.md for the per-command reasoning.

- [`88b7a6b`](https://github.com/cogenta-cms/cogenta/commit/88b7a6b3bbd9bf477ffbc45a53b3fac1b1cec00b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `npm create cogenta` with every default answer producing a site that
  `cogenta serve` cannot start.
  
  `scaffoldSite` only wrote `cogenta.schema.mjs` when the chosen blueprint had
  a real `BlueprintContentPack` — `blank`, the default blueprint
  (`DEFAULT_BLUEPRINT_ID`), has none, so no schema file was ever written for
  it. `cogenta serve` (`@cogenta/cli`) hard-requires one of
  `cogenta.schema.{ts,mts,mjs,js}` to exist next to the config, so the single
  most common path — accept every default, then run `cogenta serve` — failed
  immediately with `SCHEMA_INVALID`.
  
  The schema file is now written unconditionally: an empty collections array
  (`export default []`) for `blank`, a real content pack's collections
  otherwise — matching the "Blank — empty schema, nothing pre-configured"
  label the installer already shows. `ScaffoldResult.schemaPath` is no longer
  optional.
  
  Found and verified end-to-end against a real local npm registry (Verdaccio):
  publish every workspace package, install `create-cogenta` purely from that
  registry with no access to the monorepo, scaffold a site, and start
  `cogenta serve` against it — reproduced the crash on the unfixed code, then
  confirmed a real HTTP response (`/api/schema`, `/api/auth/session`) on the
  fixed code.
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`5d64afd`](https://github.com/cogenta-cms/cogenta/commit/5d64afdb47dd5bfdbe06cb7895391b726fb22277), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`ec2529b`](https://github.com/cogenta-cms/cogenta/commit/ec2529b7c7cb70c0c91d8275fdac4811b2d1073a), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`1b54335`](https://github.com/cogenta-cms/cogenta/commit/1b5433577617c1c3a50d123ba1a4e81c7c5c9d97), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`7a16841`](https://github.com/cogenta-cms/cogenta/commit/7a168415e2fce628d4a835eb778be396104a2590), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`3bc0872`](https://github.com/cogenta-cms/cogenta/commit/3bc0872800001aace498f331abbd903c66f750e5), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`ccfb4e1`](https://github.com/cogenta-cms/cogenta/commit/ccfb4e1c2ff2ccf528ebf4a8656c8f34f2da45ff), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`b939bf4`](https://github.com/cogenta-cms/cogenta/commit/b939bf4957bceccf01c86775a32acbf32d0925f8), [`99aa9b2`](https://github.com/cogenta-cms/cogenta/commit/99aa9b2fb2bbedeacf658b57008a863f6af81d45), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`764344a`](https://github.com/cogenta-cms/cogenta/commit/764344abe6869f855b87ff80a2cb6b1b4711c01d), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`aa878ea`](https://github.com/cogenta-cms/cogenta/commit/aa878ea6766361219fe218e17741ce1d9d9ffd2f), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/cli@0.1.0
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/render@0.1.0
  - @cogenta/theme-canonical@0.1.0
  - @cogenta/blocks@0.1.0
