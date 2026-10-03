# @cogenta/theme-restaurant

## 0.5.8

### Patch Changes

- [`cf158d8`](https://github.com/cogenta-cms/cogenta/commit/cf158d838033f7f2e54d7a16ae1b924d3a92b669) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give a logo that links out the organisation's name as the link's own name.
  
  Contract B says of the `logos` block's `name` field: "It is also the accessible
  name of the link." Every theme passed it to `image()` as `altFrom`, which is
  only the fallback used when the media library has no alt text of its own. For a
  logo that did have one — the ordinary case — the name was dropped, and the
  link's accessible name became the alt text of the picture inside it: a link to
  a farm announcing itself as "A pear poached dark red in Beaujolais". That is a
  WCAG 2.4.4 failure, and the row of logos was unusable by anyone listening to it.
  
  The link now carries the name. Nothing changes visually, and an unlinked logo
  keeps the documented fallback behaviour.
- Updated dependencies [[`5bdb9f4`](https://github.com/cogenta-cms/cogenta/commit/5bdb9f4dff7529f303ec38940d79e0e59452b502)]:
  - @cogenta/theme-kit@0.7.2
  - @cogenta/blocks@1.1.7
  - @cogenta/render@0.5.1

## 0.5.7

### Patch Changes

- Updated dependencies [`8bd7c89`]:
  - @cogenta/render@0.5.0
  - @cogenta/blocks@1.1.6
  - @cogenta/theme-kit@0.7.1

## 0.5.6

### Patch Changes

- Author archives: a byline now leads to its author's page
  
  `cogenta serve` answers `/archive/author/{slug}` with what an author published, their bio
  and portrait on top, through the same archive rendering as term and date archives. Only an
  account with a public name and at least one published dated entry has one; any other slug
  is a 404, so the addresses never list a site's accounts. Author archives are in the sitemap.
  
  Contract D `theme@1.8`, additive: `PageEntryAuthor.href` and `TermArchiveInput.intro`, with
  `authorNode` and `renderArchiveIntro` in `@cogenta/theme-kit`. Every theme links its byline
  and shows the intro; a theme that ignores both renders exactly as before.

- Embed previews: an embedded video shows its title and thumbnail, without calling the provider for the visitor
  
  An embed address is resolved through the provider's fixed oEmbed endpoint (YouTube, Vimeo,
  Dailymotion, Spotify, SoundCloud, Bluesky) — never an address a user supplied, redirects
  refused, thumbnails only from the provider's image hosts, as an image, under 2 MB. What it
  says is cached (`@cogenta/schema`'s `cogenta_embed_previews` table), and its thumbnail is
  copied into the site's storage and served at `/_cogenta/embeds/{hash}`.
  
  `@cogenta/api` adds `resolveEmbed`, `createEmbedPreviewService` and `POST /api/embeds/resolve`
  — for accounts that can update a collection, 30 a minute each — and `@cogenta/core` the
  `EMBED_URL_INVALID` and `EMBED_RATE_LIMITED` codes. A thumbnail is stored under the hash of its
  bytes, so variants of one address share one file. `cogenta serve` loads
  the page's previews before rendering and resolves missing ones in the background — a render
  never waits on the network. Contract D `theme@1.9`, additive: `RenderContext.embedPreview`,
  with `embedFrameTitle` and `renderEmbedPreview` in `@cogenta/theme-kit`; every theme names its
  player by the title and shows the preview on its consent card. Contract B is unchanged.
- Updated dependencies [`da25802`, `4747d81`, `2a34b50`]:
  - @cogenta/theme-kit@0.7.0
  - @cogenta/render@0.4.0
  - @cogenta/blocks@1.1.5

## 0.5.5

### Patch Changes

- Comments, public forms and search speak the site's language
  
  The comment section and its form were English on every site: `renderCommentsSection`
  now reads every word from `THEME_STRINGS` (French and English), writes dates in
  the page's language, accepts the page's own translator (`t`) and shows what
  became of a comment just sent (`notice`: published, awaiting review, or why it
  failed). `commentNoticeFor` reads that from the redirect; a comment held as spam
  reads as awaiting review, and a tripped honeypot only as a failure.
  
  `@cogenta/comments` sends a no-JavaScript submission back to `#cg-comments`,
  where the notice is. `cogenta serve` passes the notice and the page translator,
  and writes `/forms/{name}` and `/search` in the site's language: buttons, field
  errors, and refusals chosen by error code rather than the API's English message.
  Every theme styles the notice as it styles a form's message.
- Updated dependencies [`b5eef37`]:
  - @cogenta/theme-kit@0.6.0

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.4
  - @cogenta/render@0.3.6
  - @cogenta/theme-kit@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.3
  - @cogenta/render@0.3.5
  - @cogenta/theme-kit@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.2
  - @cogenta/render@0.3.4
  - @cogenta/theme-kit@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.1.1
  - @cogenta/render@0.3.3
  - @cogenta/theme-kit@0.5.1

## 0.5.0

### Minor Changes

- A block a plugin provides is rendered on the page
  
  Contract D grows one optional field, `RenderContext.blockNodes` (`theme@1.7`):
  markup the host already produced, keyed by the block's contract B `_key`. A
  theme honours it with one line — `providedBlockNode(block, ctx)` — and a theme
  that does not is not broken: it renders the block's declared fallback, which
  is the degradation contract B has promised since L3. The ten themes in this
  repository honour it.
  
  `cogenta serve` runs a plugin's `onRenderBlock` handler in the
  permission-restricted child process, with exactly the capabilities that plugin
  was granted, and checks the tree it returns against a tag and attribute
  allowlist before it reaches a page: no `script`, no `on*`, no `javascript:`,
  bounded depth, node count and text. A plugin that throws, times out or returns
  something else degrades to its fallback — the page is never defaced and never
  emptied.
  
  Rendered trees are cached against the plugin, its version, the block type, the
  stored values and the locale, so a block is not a forked process per visit.
  `PluginRuntime` gains `invokeHandler`, so this runs under the same concurrency
  ceiling, grants and disable-on-violation policy as a plugin route.

### Patch Changes

- Updated dependencies [`6a2b8c4`, `860bb0d`, `6fc014e`]:
  - @cogenta/blocks@1.1.0
  - @cogenta/theme-kit@0.5.0
  - @cogenta/render@0.3.2

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/theme-kit@0.4.1

## 0.4.0

### Minor Changes

- [`b8fe0c9`](https://github.com/cogenta-cms/cogenta/commit/b8fe0c9fbfa3f77244890e16b7dd7f28a54a2c14) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The Restaurant theme is redesigned for a contemporary bistro with serious
  cooking. Cormorant Garamond sets the voice of the house (the name of the
  place, titles, dish names, set-menu prices, quotations), light at large sizes;
  Karla sets running text, descriptions, navigation and the prices of the menu.
  The page is warm cream paper and deep charcoal ink, with one brass kept for the
  small capitals that name the parts of the menu, focus rings, text selection and
  the underline of links in running text. Corners are square, and structure is
  drawn with space and hairlines. Light is the default look and follows the
  visitor's setting; the dark palette is the room at night.
  
  What changes on a site:
  
  - The header is one quiet row under a hairline: the restaurant's name or logo,
    the pages in words, and the header action ("Reserve") as the one underlined
    link after a hairline. On a phone the reservation link stays in the header
    row, and the pages open as a CSS-only full-height panel of large serif links
    that also carries the address card from `general.footerNote`. The footer is
    a charcoal band with the name and tagline, the address card (line breaks in
    the footer note are kept), the footer menu, social profiles with their
    names, and the copyright line.
  - A `hero` shows the photograph across the whole window, then the name set
    large and light on the page's own ground, with the subtitle and the action
    beside it. Text is never laid over the picture, and an unstated action is a
    quiet arrow link.
  - A `collectionList` whose entries all carry a numeric `price` is a printed
    menu: grouped by the entry's `category` (or `section`, or `course`) in the
    order the entries arrive, each section named in small capitals, each dish on
    one line with a dotted leader to its price in tabular figures, the
    description under it, and "Vegetarian" in words when `vegetarian` is true.
    `grid` sets the sections in two columns, `list` in one. A priced `carousel`
    becomes a band of plates (photograph at 4:5, name and price). Entries with a
    picture and no price are 4:5 photographs named by an arrow link; anything
    else is a ruled index. A list never shows the page it is on, and a titled
    list holding a single section does not repeat that section's name.
  - A dish page now uses contract D `theme@1.5` fields: the photograph on six
    columns at 4:5 and, beside it, the section, the name, the description, the
    price and the details (`sourcing`, `pairing`, `allergens`). There is no
    order button: a restaurant takes a table, and the way to book is the site's
    own reservations page. A dish without a photograph opens on words alone. A
    host older than `theme@1.5` gets a plain page header instead.
  - A `prose` block with the `align: center` variant is set as a welcome: a few
    sentences in the display serif, centred. `featureGrid` items without icons
    become a ruled table (label on the left, value on the right, the link on the
    value, so a telephone number is what a guest taps); with icons they are ruled
    columns. `pricingTable` is a row of set menus, `quote` a press quote with a
    hanging opening mark, `testimonial` a guest's note in italic, `faq` and
    `accordion` details rows, `stats` and `statCounter` figures in the serif,
    `gallery` a band of 4:5 plates, masonry or a scrolling row, and `embed` a
    short notice card that contacts no third party before consent.
  - Every block renders in full on load. The fade-in on scroll is gone, and so
    are gradients, shadows, hover lifts and keyframes; transitions are capped at
    150 ms.
  
  Class names are new throughout, so custom CSS written against the previous
  markup needs updating. An existing site keeps the fonts and colours of its
  current skin until that skin is updated: the theme reads its typefaces and
  palette from the skin, so copy this theme's `tokens.json` into the site's
  `theme.tokens.json` (or set the skin's serif to Cormorant Garamond, its sans to
  Karla and its accent to `#7b5b1f`) to get the new typography and palette.

- The restaurant theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its charcoal footer as a second tier under a hairline, each column starting on a column of the band above, and styles the host's `cg-sidebar-layout` as the margin of a printed menu card beside a dish, a page that opens on its title and search results. Each group opens on the menu's own section label (the display serif in small capitals, in brass, over an ink rule); a call to action is the theme's filled rectangle beside a dish and underlined words on the footer band; opening hours are a ruled two-column list; a quotation is set in the light serif. Inside the content column a dish keeps its photograph and its words side by side and running text keeps its measure; on a phone the column stacks under the content on the page's own gutters. The host-rendered page title and a closing band keep their styles inside the content column, and search result excerpts now follow the evening palette instead of the skin's daytime grey. The restaurant blueprint seeds the widgets: the way to book and a critic's line beside every dish (the booking call also beside search results), and in the footer what the address card leaves out (closing days, the counter, telephone hours) and the room upstairs, each hidden on the pages that already say the same.

### Patch Changes

- Widget areas on the public site (L30). `cogenta serve` resolves the widgets of every page it renders (entries, term and date archives, search, forms), decides their visibility for the real request, reads their data through the permission-checked gateway, and either hands them to a theme that places them itself (`widgetAreas` export, contract D `theme@1.6`) or places them around the theme's output. It mounts `/api/widgets`, serves date archives at `/archive/{collection}/{year}/{month}`, follows widget dropdowns through `/_cogenta/go` (same-site paths only), includes widgets in backups and clears them on a sample-data reset. Headings of running text now carry an `id`, so a table of contents can link to them.
- Updated dependencies [`58630a9`, [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`cbfcc6d`](https://github.com/cogenta-cms/cogenta/commit/cbfcc6d9f36e18813d40a2a9bee41c3bb34e34bb), [`e5126ed`](https://github.com/cogenta-cms/cogenta/commit/e5126ed095b7ea326d765f86b3620935fd5670d9), `41d2036`]:
  - @cogenta/theme-kit@0.4.0
  - @cogenta/render@0.3.0
  - @cogenta/blocks@1.0.5

## 0.3.3

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.4
  - @cogenta/render@0.2.4
  - @cogenta/theme-kit@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.3
  - @cogenta/render@0.2.3
  - @cogenta/theme-kit@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @cogenta/blocks@1.0.2
  - @cogenta/render@0.2.2
  - @cogenta/theme-kit@0.3.1

## 0.3.0

### Minor Changes

- [`41336c2`](https://github.com/cogenta-cms/cogenta/commit/41336c23787a1d07f1bca14d760c684878157c8e) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header. Fix a real contrast bug found while verifying it: the hero's secondary action button (e.g. "View the menu") used the global `--cg-ink` text color, unreadable once a photograph and its scrim sit behind it — now overridden to `--cg-canvas` specifically when the hero carries media, leaving the plain, light no-media hero untouched.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

## 0.2.0

### Minor Changes

- 5d72083: Add `@cogenta/theme-restaurant`, a new installable public-site theme (L25 Phase 1) built
  on the `@cogenta/theme-kit` foundation: an elegant, dark-forward restaurant identity —
  Cormorant Garamond (display) + Jost (body) via Google Fonts, a charcoal/cream palette
  with a copper/wine accent, dark by default with a genuinely separately designed light
  scheme (never a plain inversion).
  
  All seventeen contract-B blocks, plus a real priced menu: `collectionList` renders a
  `menu_item` collection grouped visually by its own `category` field, each row a
  `name … dotted leader … price` line (`Intl.NumberFormat(ctx.locale, { style: 'currency',
  currency: 'EUR' })`), two columns from 1280px, `description` set in italic. The dotted
  leader and its price move together as one wrapping unit so a long dish name on a narrow
  screen pushes the price to its own line rather than ever widening the page.
  
  Full-bleed hero with a gradient scrim, a CSS-only mobile menu (`<details>`/`<summary>`,
  no JavaScript), masonry gallery, stats, testimonial, an hours/location accordion, and a
  map `embed` behind a consent placeholder that never auto-loads third-party content.
  Zero client JavaScript, zero literal colour in any stylesheet (verified by test), WCAG AA
  contrast checked in both colour schemes, 221 tests.

### Patch Changes

- 1df80de: L25 (D5, a binding product rule: a gradient reads as the generic
  "AI-generated" look) — every `linear-gradient()`/`radial-gradient()` and
  every decorative `backdrop-filter`/`filter: blur()` is removed from the five
  themes this worktree owns (`theme-saas`, `theme-blog`, `theme-restaurant`,
  `theme-association`, `theme-docs`). This completes the sweep started by the
  A0e changeset, which covered `canonical`, `ecommerce`, `entreprise`,
  `magazine` and `portfolio`.
  
  Each removal is a deliberate flat replacement, not a hole:
  
  - **Hero backdrop** (`theme-saas`): two blurred mesh-gradient halos behind
    the hero become two crisp flat geometric accents instead — a solid
    quarter-circle disc behind the copy and a solid offset panel behind the
    media frame, in the same accent tones, with no blur.
  - **Card and hero-frame borders** (`theme-saas`): the shared "faint gradient
    border" trick (a transparent border painted from a second gradient
    background layer, used by pricing tiers, testimonials, quotes, figures,
    panels and list rows, plus the hero media frame) becomes a single flat
    hairline border colour-mixed from the accent and line tokens — still
    reads as "tinted at the edge", never a wash.
  - **Highlighted pricing tier** (`theme-saas`): the accent-to-transparent
    gradient border on the featured plan becomes a flat, thicker
    (`2px solid var(--cg-accent)`) border — still visually distinct from the
    regular tier and from the impact band's own full-fill register.
  - **Impact band** (`theme-saas`, `statCounter` block): a diagonal
    `linear-gradient` fill becomes a flat solid `var(--cg-accent)` fill.
  - **FAQ plus mark** (`theme-saas`, `theme-blog`): two
    `linear-gradient(currentColor, currentColor)` layers standing in for a
    cross — already flat in effect, but literally a gradient function — are
    replaced by a single solid `background: currentColor` clipped with
    `clip-path` into the same cross shape (the same technique already used by
    `theme-entreprise`).
  - **Hero scrim** (`theme-restaurant`): a three-stop `linear-gradient` fade
    from opaque to transparent over the hero photograph becomes a single flat
    semi-transparent veil (`--cg-scrim`, retuned to 55%/62% light/dark) —
    the hero's content is centred over the whole image, not pinned to the
    bottom, so contrast needs to hold everywhere in the frame, not just near
    a caption. `--cg-scrim-soft` (only ever used as the gradient's other
    stop) is removed as now-dead.
  - **Hero halo "mat"** (`theme-association`): a blurred `radial-gradient`
    glow behind the hero photo becomes a flat accent-soft "mat" — solid
    colour, crisp rounded-rectangle edge, like coloured card stock peeking
    out from under a framed print.
  - **Sticky header** (all five): `backdrop-filter: saturate(...) blur(...)`
    frosted-glass headers become fully opaque flat panels
    (`background: var(--cg-canvas)`), still separated from the page by the
    existing hairline border. `theme-docs` had only this one blur to remove.
  
  No colour, spacing, radius or duration token changes beyond the scrim
  retuning above; every replacement still resolves entirely from the skin
  (zero literal colours, checked by each theme's own `isolation.test.ts`,
  which now also asserts zero `gradient()` and zero decorative blur across
  every stylesheet and every `.ts` file under `src/render/` — none of the
  five themes' render sources had any to begin with). Dark mode is
  unaffected — every flat fill above is a skin token, so it repaints
  correctly in both schemes without further changes.
  
  Verified per theme: `typecheck` and the full test suite (theme-saas 265,
  theme-blog 212, theme-restaurant 223, theme-association 234, theme-docs
  218 — all green, two tests higher than before per theme, for the two new
  D5 assertions). A scaffolded `saas` blueprint site (the worst offender —
  nine gradients, two blurs) was built, served, and inspected live in a
  browser in both light and dark mode: the hero's flat disc-and-panel
  backdrop and the flat plus-mark FAQ icons read as deliberate geometric
  elements, not a hole where a glow used to be.
- Updated dependencies [4335296]
- Updated dependencies [722fc6b]
- Updated dependencies [7a59646]
- Updated dependencies [562c9c1]
- Updated dependencies [a15b1ae]
- Updated dependencies [befad6d]
- Updated dependencies [a915e1a]
- Updated dependencies [86fc9cf]
- Updated dependencies [54409f3]
- Updated dependencies [a6530f6]
- Updated dependencies [1995d35]
- Updated dependencies [4335296]
- Updated dependencies [05f9e29]
  - @cogenta/blocks@1.0.0
  - @cogenta/theme-kit@0.2.0
  - @cogenta/render@0.2.0
