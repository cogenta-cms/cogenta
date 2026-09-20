# @cogenta/starters

## 0.4.0

### Minor Changes

- [`95fdc8d`](https://github.com/cogenta-cms/cogenta/commit/95fdc8df7d3105bcfdcae7ab060246866a78dae9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give the `blog` blueprint a `topic` field and a carousel section, to exercise the blog theme's new listing forms.
  
  `post` gains an optional plain-text `topic` field (mirroring the `magazine` blueprint's
  own `kicker` field), populated on the ten demo posts, so `@cogenta/theme-blog`'s new
  small-caps topic label shows real content on a scaffolded site rather than staying
  empty. The home page gains a `carousel`-layout `collectionList` ("A few more essays"),
  since nothing in the blueprint previously used that layout — the blog theme's new
  `strip` form had no demo content to render.

- [`afa9229`](https://github.com/cogenta-cms/cogenta/commit/afa9229126640355f3034d0d662cc4f3097a8d95) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give every blog essay its own photograph, closing the gap with theme-magazine's density.
  
  Only 4 of the 10 demo posts carried a cover, so the same four photographs kept
  reappearing across the front page (the hero, a listing card, a carousel item), while
  three full essays had no image at all — visibly sparser than `@cogenta/theme-magazine`'s
  own demo content, where every story is illustrated. Two new real, credited photographs
  (a pair of hands typing on a laptop, a small public library's facade — both CC0/CC BY,
  sourced the same way as the existing five) plus the one already-bundled but unused
  `pour-over.jpg` now cover the three remaining essays, so all seven full essays carry
  their own distinct photograph and none is reused. The three "Letter:" posts stay
  text-only by design — a personal letter isn't a produced piece the way an essay is, so
  this isn't "every post gets a photo" but "every post that would have one only once."

- [`dea8093`](https://github.com/cogenta-cms/cogenta/commit/dea809374a43c1b2328858e2e190e27f7d5651ff) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Replace the blog blueprint's AI-generated cover photos with real, credited ones.
  
  The five photographs `photo-assets.ts` bundled for the `blog` blueprint at L25 were
  generated once via Replicate — convincing at a glance, but depicting nothing real, with
  no verifiable licence today (the key that generated them no longer exists). They are
  replaced with five real photographs from Wikimedia Commons and Flickr, each under CC0,
  the public domain, or a Creative Commons Attribution licence (never ShareAlike, never
  NonCommercial) — the same discipline `@cogenta/theme-entreprise`'s `vitrine` blueprint
  already keeps for its own twenty-two photographs.
  
  A new seeded "Photo credits" page (`blog-credits.ts`, linked from the footer) lists the
  title, author, licence and source of every photograph, satisfying attribution licences
  without inventing a second crediting mechanism. Alt text for all five images is rewritten
  to describe what the new photographs actually show.

- [`8f85628`](https://github.com/cogenta-cms/cogenta/commit/8f856289c373b75ba754e06aa615e352797fcd2e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Let a site publish the content it was scaffolded with. Nothing could.
  
  Every one of the nine blueprints shipped at least one collection that no role
  could publish — and on all nine, one of them was `page`. A person who created
  a page on a fresh Cogenta site got a status control offering only "Draft", no
  publish button, and `403 — collection "page" grants "publish" to no role` from
  the API. Nineteen collections in total: the shared `page` on all nine, plus
  every collection of `vitrine` (solution, case study, testimonial, job, post),
  `saas` (feature, changelog), `association` (event, programme) and
  `documentation` (doc page).
  
  `CollectionPermissions` is a `Partial<Record<ContentAction, …>>`, and an action
  nobody declares normalises to `{ roles: [], own: false }` — nobody, admin
  included. That is the right default for a permission system, and it is exactly
  why the compiler was no help: omitting `publish` is a perfectly well-typed way
  to ship a collection whose content can never go live. The six collections that
  did work were right by vigilance, not by construction.
  
  It stayed invisible because seeded demo content is written straight into the
  store, bypassing the permission layer entirely: every demo site looked
  complete, and only the first hand-written entry hit the wall.
  
  `test/blueprint-permissions.test.ts` now walks every blueprint we ship and
  fails on any collection missing any of the five actions, so forgetting one on
  a new blueprint is a failing test rather than a site nobody can use. The
  `vitrine` blueprint's permission constant is split in two along the way: it was
  shared with a taxonomy, and `publish` has no meaning on a term — which is how
  one omission spread across six collections.

- [`c10f21f`](https://github.com/cogenta-cms/cogenta/commit/c10f21f90482ea06636ca8b44ae76222aabfdafe) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give every shipped blueprint drafts and version history.
  
  Of the twenty-five publishable collections the nine blueprints ship, exactly
  one declared `versioning` — `blog`'s `post`. The other twenty-four had
  neither half, and both halves live in that one object, so a single omission
  produced two separate failures on every other site:
  
  - **No drafts.** Every save of a published entry went straight to the public
    page. There was no such thing as an unpublished edit: opening a live
    article, fixing a sentence and pressing save published it, with nothing to
    review and no way back but another edit.
  - **No history.** The store keeps a bare minimum of two versions without it,
    so the admin's History tab — which is shown on every saved entry, of every
    collection — could hold at most two, and restoring an older one evicted it.
  
  Both stay opt-in in the contract, deliberately: unlimited history is a slow
  leak, and a collection that genuinely wants neither should be able to say so.
  What was not deliberate is twenty-four shipped collections silently not
  asking.
  
  A test now walks every blueprint and fails on a publishable collection
  missing either half, the same guard the `publish` permission got.
  
  Verified against a freshly scaffolded magazine site: editing a published
  article left the public page untouched until `publish`, which then showed the
  edit; six versions were kept across six writes where two would have been.

### Patch Changes

- [`797d8e8`](https://github.com/cogenta-cms/cogenta/commit/797d8e8d1397d4fe3236689db88ac1d92a3b5c2d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Stop writing English field labels into the schemas the blueprints scaffold.
  
  Nine fields — `topic`, `kicker`, `discipline`, `icon`, `orderLink` and the
  four SEO ones — shipped an English `admin.label` and `admin.help`, so a French
  site's entry form read "Topic", "SEO title", "Hide from search engines". The
  admin names them instead, in whichever language the person looking at them
  chose (ADR-0019 makes that a preference of the person, which a label written
  into a schema file at scaffold time cannot follow).
  
  Four labels stay, deliberately: a portfolio's `summary` is a **Statement** and
  a SaaS feature's `coverImage` is a **Screenshot**. There the blueprint is not
  repeating what the field is, it is giving a generic field its own word, and a
  dictionary keyed by field name would flatten it.
  
  A site already scaffolded keeps the labels in its own `cogenta.schema.*`,
  which is still the first thing the admin reads. Nothing changes for it unless
  those lines are removed by hand.
- Updated dependencies [[`dcf76f4`](https://github.com/cogenta-cms/cogenta/commit/dcf76f4ef93be5bae52196a5a610df4f0a36dfba), [`8c894db`](https://github.com/cogenta-cms/cogenta/commit/8c894dba796f01b589f151537ba24490fe668aae), [`5bdb9f4`](https://github.com/cogenta-cms/cogenta/commit/5bdb9f4dff7529f303ec38940d79e0e59452b502), [`9a0cff5`](https://github.com/cogenta-cms/cogenta/commit/9a0cff523622e5649869398c2fbf1f31f0521785), [`d1df23d`](https://github.com/cogenta-cms/cogenta/commit/d1df23d88dee1a60ffa02e4e9b48525c7894257a), [`f0ae47b`](https://github.com/cogenta-cms/cogenta/commit/f0ae47b43d6af765d7142fda176d79c7c82ee4b9), [`c44b988`](https://github.com/cogenta-cms/cogenta/commit/c44b9882247c7d0b0a12f1492930af06428408f2), [`8b7f6aa`](https://github.com/cogenta-cms/cogenta/commit/8b7f6aa826eebf14a1e859ab61d4a365bccb25ba), [`99c21a0`](https://github.com/cogenta-cms/cogenta/commit/99c21a0ac93a49064b77cf9ba08cfe15815f1782), [`8bbcc4f`](https://github.com/cogenta-cms/cogenta/commit/8bbcc4ff883051241cbf06f65b59458ecb7d9f57), [`276a22e`](https://github.com/cogenta-cms/cogenta/commit/276a22e6e06f2110191c872f11bb6a0b0ab80e4e), [`ccf489d`](https://github.com/cogenta-cms/cogenta/commit/ccf489d67a1ba81b4f0aa5ccbbcecc30f671f1d6), [`ea2d505`](https://github.com/cogenta-cms/cogenta/commit/ea2d505c2204996eed5737596de7863dd5eda188), [`0bd4e72`](https://github.com/cogenta-cms/cogenta/commit/0bd4e72d937d0b522315a401225dd4741508fd50), [`38ff019`](https://github.com/cogenta-cms/cogenta/commit/38ff0195daf6e0d5e0f118b33363df6b8733809b)]:
  - @cogenta/core@0.12.1
  - @cogenta/api@2.11.0
  - @cogenta/theme-kit@0.7.2
  - @cogenta/schema@0.11.0
  - @cogenta/blocks@1.1.7
  - @cogenta/render@0.5.1
  - @cogenta/widgets@0.2.7

## 0.3.0

### Minor Changes

- Sort a list by a date the collection declares itself (L40, contract A `schema@2.4`,
  ADR-0038)
  
  `SortOrder.field` accepts the name of a declared `date`/`datetime` field beside `id`,
  `createdAt` and `updatedAt` — which is what makes "the next events" a list a site can
  actually show. Entries with no date are **always last**, in both directions, by an order
  written out explicitly (`case when … is null`) rather than left to each engine's own null
  placement; the cursor carries a nullable value, so the tail of empty dates pages like the
  rest. Any other field is refused by name, with the collection said in the message.
  
  In a stored filter, the exact tokens `"$now"` and `"$today"` are resolved by the API at
  every request and never stored resolved — a "from now on" list saved today must still be
  true tomorrow. A page whose blocks depend on the clock has its public cache lifetime
  capped at an hour.
  
  Two defects found by a dialect review and fixed here: a cursor was minted from the entry
  rather than from the row the database ordered, which silently dropped rows in the working
  state when a pending draft moved a date; and a date cleared to an empty string is now
  stored as no date at all, which also fixes clearing a date field from the admin.
  
  Strictly additive: a caller that sorts by a system column gets exactly the ordering and
  the cursor it got before.

### Patch Changes

- Updated dependencies [`8bd7c89`, `8bd7c89`, `8bd7c89`]:
  - @cogenta/schema@0.10.0
  - @cogenta/api@2.10.0
  - @cogenta/render@0.5.0
  - @cogenta/blocks@1.1.6
  - @cogenta/widgets@0.2.6
  - @cogenta/theme-kit@0.7.1

## 0.2.2

### Patch Changes

- Updated dependencies [`da25802`, `4747d81`, `2a34b50`]:
  - @cogenta/theme-kit@0.7.0
  - @cogenta/core@0.12.0
  - @cogenta/schema@0.9.0
  - @cogenta/api@2.9.0
  - @cogenta/render@0.4.0
  - @cogenta/blocks@1.1.5
  - @cogenta/widgets@0.2.5

## 0.2.1

### Patch Changes

- Updated dependencies [`b5eef37`]:
  - @cogenta/theme-kit@0.6.0

## 0.2.0

### Minor Changes

- The showcase blueprint is now an engineering company, written in French and in English
  
  `vitrine` presents a fictional company that designs sensors, a monitoring
  platform and field services for electricity, water and rail networks. It seeds
  six solutions, four case studies filed by sector, three testimonials, four job
  openings, four articles (schedulable, so they appear in the editorial calendar)
  and ten pages, including legal notice, privacy policy and photo credits.
  
  The copy exists in French and in English and follows the site's default
  locale, addresses included (`/references/…` in French, `/case-studies/…` in
  English): `@cogenta/starters` gains `contentPackFor(id, locale)`, which
  `create-cogenta` now uses when it scaffolds and when it resets a playground.
  
  Every photograph is a real one from Wikimedia Commons under CC0, the public
  domain or a Creative Commons Attribution licence, credited on the site's own
  credits page; the previous generated images are removed. Client logos and the
  product screenshots are drawn for the blueprint.
  
  Breaking for code importing the blueprint's internals: the `VITRINE_*`
  constants and the `service` collection are replaced by `vitrineSchema(copy)`,
  `buildVitrineDemoPages(copy, context)`, `vitrineMenus`, `vitrineWidgets`,
  `vitrineSiteSettings`, `vitrineMediaSpecs` and `createVitrineContentPack`.

### Patch Changes

- theme-entreprise takes the register of an engineering company
  
  Visible change for every site using this theme: Geist replaces Newsreader and
  Hanken Grotesk, Geist Mono sets labels, indices and figures, the palette moves
  to a cool grey paper, a blue-black ink and a signal green. A hero with a
  photograph is now full bleed, its title over a flat ink veil (no gradient);
  `stats` becomes an ink band; a `mediaFigure` set wide spans the grid with its
  caption beneath; a list entry that declares `keyFigure` (and `keyFigureLabel`)
  shows it under its summary. No contract changes (`theme@1.7`), no markup
  removed.
  
  `create-cogenta` closes comments on the collections a blueprint names in the
  new `commentsDisabledOn` of its content pack; `vitrine` names solutions, case
  studies, jobs and articles, so a company site never ends a page with a comment
  form.

- The showcase site's solution icon is a choice, not a name to remember
  
  The field listed the symbols to type in its help text; it is now a select over
  `@cogenta/theme-kit`'s `ICON_NAMES`, the icons every theme draws.
- Updated dependencies [`01deb2a`, `db6ee94`]:
  - @cogenta/schema@0.8.0
  - @cogenta/api@2.8.1
  - @cogenta/blocks@1.1.4
  - @cogenta/widgets@0.2.4
  - @cogenta/render@0.3.6
  - @cogenta/theme-kit@0.5.4

## 0.1.5

### Patch Changes

- Updated dependencies [`3bb1d5c`, `cf981a0`]:
  - @cogenta/api@2.8.0
  - @cogenta/schema@0.7.1
  - @cogenta/blocks@1.1.3
  - @cogenta/widgets@0.2.3
  - @cogenta/render@0.3.5

## 0.1.4

### Patch Changes

- Updated dependencies [`aef3a40`]:
  - @cogenta/schema@0.7.0
  - @cogenta/api@2.7.0
  - @cogenta/blocks@1.1.2
  - @cogenta/widgets@0.2.2
  - @cogenta/render@0.3.4

## 0.1.3

### Patch Changes

- Updated dependencies [`082a630`, `43d82cf`, `130d762`, `3872f56`]:
  - @cogenta/schema@0.6.0
  - @cogenta/api@2.6.0
  - @cogenta/blocks@1.1.1
  - @cogenta/widgets@0.2.1
  - @cogenta/render@0.3.3

## 0.1.2

### Patch Changes

- Updated dependencies [`6a2b8c4`, `6fc014e`]:
  - @cogenta/blocks@1.1.0
  - @cogenta/widgets@0.2.0
  - @cogenta/api@2.5.2
  - @cogenta/render@0.3.2

## 0.1.1

### Patch Changes

- Updated dependencies [`f3bc81f`, `614f545`]:
  - @cogenta/api@2.5.1
  - @cogenta/core@0.11.0
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/schema@0.5.4
  - @cogenta/widgets@0.1.1

## 0.1.0

### Minor Changes

- Widgets in the sample data (L30). A blueprint content pack can declare `widgets` (`BlueprintWidget`, seeded by `seedBlueprintWidgets` through the real widget store), and the magazine blueprint places a rail (search, latest stories, sections, the membership pitch) beside its stories, section fronts and search results, with related stories under each article. `npm create cogenta` seeds them with the menus; importing a theme's sample data from the admin fills empty widget areas and keeps an area the site already fills (`widgets` in the preview, warning `widgets-kept`), and a reset counts the widgets it deletes. `cogenta serve` now draws the sidebar beside the content of every reading page (an article, an archive, search results, a form) in one markup, `cg-sidebar-layout`, with the entry's comments in the same column; the home page and a page opening on its own hero keep their full width.

- [`ae9338b`](https://github.com/cogenta-cms/cogenta/commit/ae9338b6e95bdbe5d39d8a3db6a954060f9f1546) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package: the starter content packs `create-cogenta` seeds, now importable
  by other tools. It carries, per site type, the collections and taxonomies, the
  demo entries, the menus, the site settings, the starting skin and the demo
  media (bundled photographs and the procedural `demo-art` renderer), through
  `BLUEPRINT_CONTENT_PACKS`, `seedDemoMedia`, `seedBlueprintMenus`,
  `seedSiteSettings` and `STARTING_SKINS`. Nothing about the content itself
  changes: this is the code `create-cogenta` has always run, moved so that
  `@cogenta/cli` can apply a theme's sample data without depending on the
  installer.

### Patch Changes

- `@cogenta/theme-association` sets widget areas (`theme@1.6`) in its own register. It exports `widgetAreas` (`sidebar`, `content-after`), places footer widget columns on its green band under the menu and above the legal line, and ships `styles/widgets.css`. That sheet sets the shared sidebar layout as a noticeboard side column: every widget opens on the heavy ink rule the calendar uses, lists sit between hairlines with square photographs, and an ask sits on the paper band with the green button. The yellow stays reserved for the header's donation ask. Beside the side column, an event keeps its date and details and a programme keeps its portrait. A footer with no widgets renders byte for byte as before. Rules that read a direct child of `<main>` also match inside the layout's content column. Search results now set titles in the display face and summaries in the text face, and the search field and its button share one height.
  
  The `association` blueprint seeds its side column. An event page shows the four weekly programmes and a call to volunteer. A programme page shows the ask to keep it free and the advice sessions at the hall. Search results show the ask and the programmes. The home page and site pages keep their full width.

- The blog theme now sets widget areas in its own register (contract D `theme@1.6`): it declares `widgetAreas`, so footer widget columns sit inside its colophon between the navigation and the legal line, and a new `widgets.css` puts the host's sidebar layout on the theme's twelve-column grid. On a wide screen the content keeps nine columns, so the margin and the text line stay exactly where they are on every other page, and the sidebar takes the last three; below that width the sidebar follows the content in as many columns as fit. Widgets use the theme's own type (small-capital labels on an ink rule, titles in the text face, hairlines between rows, fields drawn as baselines), and related entries after an essay are set like the index, with the date in the margin. The `blog` blueprint now seeds a sidebar (about, search, recent posts, subjects with counts, tags, posts by year) on posts, subject and tag archives, date archives and search results, plus a "Further reading" list under each post.

- The documentation theme now declares its widget areas and sets them in its own register. On a documentation page the sidebar becomes the right-hand rail it shares with "On this page": the contents stay in view while the page is read and the widgets sit at the foot of the rail, level with the end of the article, so the docs grid never gains a fourth column; a page with no contents gives the rail to the widgets, between 64rem and 80rem they close the article's column, and on a phone they follow the page. Beside search results and archives the same rail sits at the page's right edge. Footer widget columns are placed inside the theme's footer, above the legal line, and search result summaries take the theme's muted ink in dark mode. The documentation blueprint seeds a "Need help?" list and the 2.4 upgrade note on doc pages, and a "Popular pages" list beside search results.

- The shop theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its stone footer as a tier under a hairline, each column starting on a column of the row above, and styles the host's `cg-sidebar-layout` the way a product sheet sets its details: a caption label, ruled rows of words, a product's photograph at 4:5 on the plate, a call to action as the theme's arrow link and a search button as underlined words, so the one filled ink rectangle stays with the page's own action. Beside the column a page title stacks over its lead, running text and questions take the column at the reading measure, goods go three across and a product's photograph and sheet share the column; on a phone and a tablet the column follows the page. A strip of entries with photographs before or after the content lines up with the goods grid. Host-rendered page titles keep their style inside the content column, and search excerpts and counts follow the dark palette. The store blueprint seeds a customer care list and a contact prompt beside the ordering, delivery, repairs, contact and terms pages, the newest pieces beside search results, and in the footer the shop's telephone and the letters from the workshop, each hidden where the page already says the same; the contact page now names the letters' address.

- The entreprise theme now declares its widget areas (`theme@1.6`) and sets them in its own register: beside a case study, a practice, a sector archive or search results, the side column sits on the page's own gutters with each widget opening on an ink rule and a small-capitals label, work titles in the display serif, counts in tabular figures, and the call to discuss a mandate as the theme's one dark plane; under the text, selected work reads as an exhibit of three. The reading column keeps its hanging headings on a wide screen and stacks them above the text when narrower, the sidebar stacks under the content on mobile, footer widget columns are placed inside the theme's own footer, and rules that read a direct child of `<main>` still apply inside the sidebar layout. The search results page also gets its excerpts in the text face and a dark-aware result count. The `vitrine` blueprint seeds the widgets such a firm would have: sectors with counts, other case studies and the mandate call beside a case study, the other practices and a partner's contact details beside a practice with selected work under it, and a search box and sectors on a sector archive, never on the home page or the site's own pages.

- The portfolio theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, opens its footer on a tier of widget columns right under the footer's hairline, on the footer's twelve columns (one column alone is set like the theme's contact block, a call to action's heading at the size of the contact line), and styles the host's `cg-sidebar-layout` on the page's own grid: the content on the first eight columns, the widgets on the last three, the columns the header's navigation and the footer's profiles already stand on. Every widget opens like a block of the theme, a hairline in ink and a small sentence-case label; lists are ruled rows like the index of work, the page being read underlined in the signal; work in a widget keeps its 3:2 cover, and before or after the content it is a row of covers across the grid that becomes a scrolling strip on a phone; a call to action is the theme's arrow link, never a second filled rectangle; headings and quotations stay in Archivo instead of the host floor's serif. Inside the content column a project, an archive, running text and the work grid keep their proportions on eight columns, and the first section keeps its opening space. The host-rendered search page is now set in the theme's register on the page's edges: its title at the size of an archive title with the count under it, the form as a baseline field, the results as ruled rows with the date under the title and the statement beside it. The portfolio blueprint seeds the widgets: after a project, the three projects that share the most with it at their covers; beside the index of a discipline, a client or a member of the team, the other terms of that taxonomy, and the disciplines beside search results; in the footer, the studio's invitation to new work on every page that does not already end on one. No column is placed beside a project.

- The restaurant theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its charcoal footer as a second tier under a hairline, each column starting on a column of the band above, and styles the host's `cg-sidebar-layout` as the margin of a printed menu card beside a dish, a page that opens on its title and search results. Each group opens on the menu's own section label (the display serif in small capitals, in brass, over an ink rule); a call to action is the theme's filled rectangle beside a dish and underlined words on the footer band; opening hours are a ruled two-column list; a quotation is set in the light serif. Inside the content column a dish keeps its photograph and its words side by side and running text keeps its measure; on a phone the column stacks under the content on the page's own gutters. The host-rendered page title and a closing band keep their styles inside the content column, and search result excerpts now follow the evening palette instead of the skin's daytime grey. The restaurant blueprint seeds the widgets: the way to book and a critic's line beside every dish (the booking call also beside search results), and in the footer what the address card leaves out (closing days, the counter, telephone hours) and the room upstairs, each hidden on the pages that already say the same.

- The saas theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its footer on the same twelve columns, and styles the host's `cg-sidebar-layout` as a quiet side column beside changelog entries, feature pages, archives and search results, parted from the content by a hairline, with small semibold labels, dates and counts in Geist Mono, the column search as a hairline control and the call to action as the theme's one primary button; on a phone the column stacks under the content on the page's own gutters. Blocks inside the content column keep the page edges and a full reading measure, and the search page title keeps its style there. The saas blueprint seeds that column: a search box, the changelog by month, recently shipped releases, resource links and a demo call to action, each shown only where the page does not already list the same thing.
- Updated dependencies [`ffbfcc3`, `166b71e`, [`7711371`](https://github.com/cogenta-cms/cogenta/commit/77113713a5be32d462995565474b0fa546653147), `dc78c2c`, [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`78989f1`](https://github.com/cogenta-cms/cogenta/commit/78989f11702f3c4e9dfdd0328fc50099fceabd64), [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/api@2.5.0
  - @cogenta/core@0.10.0
  - @cogenta/widgets@0.1.0
  - @cogenta/render@0.3.0
  - @cogenta/blocks@1.0.5
  - @cogenta/schema@0.5.3
