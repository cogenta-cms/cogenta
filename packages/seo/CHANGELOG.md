# @cogenta/seo

## 0.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [a2516aa]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [916ef34]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [7b7ec0b]
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
- Updated dependencies [e75b23e]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
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

## 0.2.1

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944)]:
  - @cogenta/core@0.4.0
  - @cogenta/schema@0.3.0

## 0.2.0

### Minor Changes

- [`45d2815`](https://github.com/cogenta-cms/cogenta/commit/45d281560017abde1a069b01458a709293c1613b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `isPublished` no longer refuses an entry whose `publishedAt` is `null`.
  
  `publishedAt` is an ordinary contract A field, not a system column:
  `ContentStore` returns `null` for it on every entry of every collection
  that does not declare one — which is most of them, including all nine
  `create-cogenta` blueprints. Treating that as "not published" made the
  whole package refuse the site it was pointed at: every rendered page got
  `<meta name="robots" content="noindex, nofollow">`, no canonical, no
  `hreflang`, and `sitemap.xml` came back as an empty `<urlset/>`.
  
  `status` remains the authority on whether an entry is public and `state`
  on which face is being read — both are still required. A `publishedAt`
  that exists and is in the future still blocks, so scheduled publication
  is unaffected, and a collection with no such field cannot have scheduled
  anything in the first place.
  
  Found the first time the package ran against a real `cogenta serve`
  (L10 task 1) rather than against values; every existing fixture set a
  date by hand, so no unit test could have caught it.

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/schema@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

- [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/seo`, the SEO floor of L3: sitemaps, `robots.txt`, JSON-LD, Open Graph and
  Twitter Card, RSS and Atom, `hreflang`, canonicals, `llms.txt` and IndexNow. No new
  dependency — XML is serialised in the package, escaping included.
  
  **Sitemaps.** `buildSitemap` returns the files to write. Below the protocol limits that
  is one `sitemap.xml`; above them it is an index plus numbered chunks, and the caller
  writes what it gets either way. Both limits are enforced — 50 000 URLs *and* 50 MB per
  file — because `xhtml:link` alternates make a multilingual site reach the byte cap long
  before the URL cap.
  
  **JSON-LD derived from the schema, never hand-written.** A collection named `article`
  produces an `Article`, `page` a `WebPage`, `author` a `Person`; an unrecognised name falls
  back to the shape of its fields. Field kinds and names map to properties (`title` →
  `headline`, `excerpt` → `description`, `cover` → `ImageObject`, an `author` relation →
  `Person`). Media and relation identifiers are resolved through injected callbacks, and an
  identifier that cannot be resolved is **omitted** rather than emitted raw.
  
  **`hreflang` from the translation family (ADR-0014).** The alternate set is computed once
  per family and shared by every member, so reciprocity is structural rather than
  emergent — two pages cannot disagree because they hold the same list. `x-default` names
  the source entry, and is omitted entirely when the source is unpublished rather than
  guessing a translation.
  
  **Nothing unpublished ever leaves.** One gate — published status, published face, a
  publication date that has passed, and a resolvable URL — is asked by the sitemap, the
  feeds, the `hreflang` map, `llms.txt` and the metadata builder alike.
  
  **IndexNow** returns a result rather than throwing on a failed ping: publishing an
  article must not fail because a third-party endpoint is down. `fetch` is injected, and its
  absence degrades to a no-op (rule R1).

- [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the rendering layer: `@cogenta/render`, `@cogenta/theme-canonical` and `@cogenta/seo`.
  
  A theme reads content through an HTTP client carrying a read-only token, never through
  the data layer (ADR-0016), and the isolation is checked at install rather than documented
  and hoped for. A hostile-theme fixture proves the refusal against every route in: a bare
  `fs` alias, a subpath import, a template-literal dynamic import, `createRequire`, an
  import inside a `<script>`, and a `node:fs` alias smuggled through `package.json`
  `imports`. The inverse guard matters as much — a theme whose prose contains `don't`, a
  class named `process` and a commented-out import yields zero findings.
  
  The canonical theme implements the twelve blocks with no JavaScript at all, asserted:
  no script tag, no `on*` attribute, no `client:*` directive. Heading levels are read from
  the block vocabulary rather than restated, so a titleless `featureGrid` keeps its items
  at `h2` and no level is skipped. `consentRequired` suppresses even the provider
  thumbnail, because a thumbnail already leaks the visitor's IP.
  
  Skins validate as hard refusals: AA contrast on every declared pair with no epsilon on
  the threshold, a monotonic type scale, no missing and no unknown token, and
  `prefers-reduced-motion` honoured. A token value containing CSS syntax is refused — a
  skin is a shareable JSON file interpolated into a stylesheet, and without that check it
  is code rather than data.
  
  SEO derives JSON-LD from the schema, keeps `hreflang` reciprocal by construction, and
  blocks indexing on the working state as well as on draft status: a feed rendered from
  the working face ships unreviewed edits, which is the same leak as a draft and far
  harder to notice.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/schema@0.1.0
