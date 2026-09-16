# @cogenta/theme-association

## 0.4.0

### Minor Changes

- [`34fc60c`](https://github.com/cogenta-cms/cogenta/commit/34fc60ce348c28ddc1f496099bcc77b6f85a03e9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The Association theme is redesigned for a neighbourhood charity people trust
  with their food, their children's homework and their Saturday mornings.
  Bricolage Grotesque sets what a visitor reads first (the statement of the
  cause, titles, figures, dates, quotations), with its optical size following the
  font size and its width axis narrowing the largest sizes; Source Sans 3 sets
  running text, navigation, times and places. The page is warm paper and a
  green-black ink. One deep green is the organisation's own colour (links,
  figures, bars, the filled button, the footer band), and one signal yellow is
  kept for the donation ask: the header action, the hero's first action and the
  call-to-action band. Corners are square on photographs and softened by a hair
  on buttons. Light follows the visitor's setting; the dark palette is designed
  (a deep green-black ground, a pale sage for the green, the same yellow).
  
  What changes on a site:
  
  - The header is one row under a hairline: the organisation's name or logo, the
    pages in words, the header action as the yellow button, and the light/dark
    control. On a phone the donation button stays in the row, and the pages open
    from a "Menu" button (CSS only) as a full-height panel of large links with
    the tagline under them. The footer is the green band: name, tagline, the
    footer note with its line breaks kept (a registered charity number, an
    address, a telephone number), social profiles with their names, the footer
    menu in columns (an unlinked menu item starts and names a column), and the
    copyright line.
  - A `hero` shows the photograph across the whole window. The statement of the
    cause is set on a sheet of the page's paper that rises into the bottom of
    the photograph, with the subtitle and the actions beside it. Text is never
    laid over the picture.
  - A `collectionList` whose entries all carry a date (`startsAt`, `start`,
    `date` or `eventDate`, with `endsAt` or `end`) is a calendar in date order:
    a typographic date block (month, day, weekday), the title, the hours and the
    place, the summary, and the `cost` when there is one. Entries with pictures
    are alternating rows of picture and words in a `list` (with `schedule`,
    `location`, `address` and `audience` when the entry has them) and photo cards
    in a `grid`; anything else is a ruled index. A list never shows the page it
    is on.
  - An entry page uses contract D `theme@1.5` fields. An event opens on a large
    date block with the year, its title and summary, and its practical details
    (when with the hours, where with the street address, cost, booking), then
    its photograph. Any other entry with details or a picture (a programme)
    opens on its title, summary and details with the photograph beside or under
    them. Contacts that are email addresses or telephone numbers become links.
    Times are read in UTC, as stored, and written the way the charity's copy
    writes them: "6pm to 7.30pm" for a locale whose clock is twelve-hour, "18:30"
    for one whose clock is twenty-four-hour, chosen from the page locale through
    `Intl`. A host older than `theme@1.5` gets a
    plain page header.
  - `stats` items are figures with their sentence of context; `stats` and
    `statCounter` items that are percentages adding up to a whole are drawn as a
    breakdown with a bar each. A `cta` is the yellow ask band, and when its text
    lists gifts sentence by sentence ("£5 a month buys the bread for one
    Thursday.") the amounts are set beside what they pay for; with the
    `background` variant it is a quieter band on the paper's darker stock.
  - `featureGrid` items with icons are ruled columns; without icons they are
    numbered steps. `testimonial` sets the person's portrait at 4:5 beside their
    words, `quote` is large with a hanging opening mark, `faq` prints every
    answer in two columns, `accordion` is a list of details rows, `pricingTable`
    is ruled columns of giving levels, `logos` and `logoStrip` set partner marks
    in one ink (inverted in the dark), `gallery` composes one, two, three, four
    or more pictures without gaps, and `embed` is a short notice card that
    contacts no third party before consent.
  - Every block renders in full on load. The fade-in on scroll is gone, and so
    are gradients, shadows, halos, pill badges, icon tiles, hover lifts and
    keyframes; transitions are capped at 150 ms.
  
  Class names are new throughout, so custom CSS written against the previous
  markup needs updating. An existing site keeps the fonts and colours of its
  current skin until that skin is updated: the theme reads its typefaces and
  palette from the skin, so copy this theme's `tokens.json` into the site's
  `theme.tokens.json` (or set the skin's serif to Bricolage Grotesque, its sans
  to Source Sans 3 and its accent to `#1d5b3e`) to get the new typography and
  palette.

- `@cogenta/theme-association` sets widget areas (`theme@1.6`) in its own register. It exports `widgetAreas` (`sidebar`, `content-after`), places footer widget columns on its green band under the menu and above the legal line, and ships `styles/widgets.css`. That sheet sets the shared sidebar layout as a noticeboard side column: every widget opens on the heavy ink rule the calendar uses, lists sit between hairlines with square photographs, and an ask sits on the paper band with the green button. The yellow stays reserved for the header's donation ask. Beside the side column, an event keeps its date and details and a programme keeps its portrait. A footer with no widgets renders byte for byte as before. Rules that read a direct child of `<main>` also match inside the layout's content column. Search results now set titles in the display face and summaries in the text face, and the search field and its button share one height.
  
  The `association` blueprint seeds its side column. An event page shows the four weekly programmes and a call to volunteer. A programme page shows the ask to keep it free and the advice sessions at the hall. Search results show the ask and the programmes. The home page and site pages keep their full width.

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

- [`87ae89a`](https://github.com/cogenta-cms/cogenta/commit/87ae89ab5e3fdb5197da821ffedc53a2471349db) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header. Fix a real layout bug found while verifying it: `.cg-impact__items`'s fixed `repeat(4, 1fr)` desktop column count, reused by an event's own "When / Where" panel (only two items), left two ghost columns of empty space — switched to `repeat(auto-fit, minmax(9rem, 1fr))` so two items stretch to fill the row exactly as four items already did.

### Patch Changes

- Updated dependencies [[`e6e0c55`](https://github.com/cogenta-cms/cogenta/commit/e6e0c55fcd5750d9b537825b454653a96cafcb61)]:
  - @cogenta/theme-kit@0.3.0
  - @cogenta/blocks@1.0.1
  - @cogenta/render@0.2.1

## 0.2.0

### Minor Changes

- 8a13e08: New theme package (L25, Phase 1): a warm, human theme for a nonprofit or
  community group — Nunito + Source Sans 3, a deep-green accent on a light
  warm off-white ground, a genuine dark mode (forest green, not an inverted
  grey), generously rounded cards and buttons. Implements all seventeen
  `blocks@2.0` vocabulary blocks, `theme@1.4` chrome (tagline, social links,
  footer note, header action), a term archive, zero client JavaScript, zero
  literal colour (every value derives from the skin's own tokens), WCAG AA
  contrast verified in both colour schemes. 232 tests.
  
  Ships alongside the `association` blueprint (`create-cogenta`), which
  activates this theme by default, seeds an `event` collection with six
  future-dated demo events (each carrying a "When / Where" panel) and six
  content pages, and renders procedural demo visuals (hero backdrop, event
  covers, a gallery, a volunteer avatar, partner marks) through the real
  media pipeline.

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
- a915e1a: Fixes from the final live review of every scaffolded blueprint (L25): the association
  theme's event cards stack their cover over a date + text row and never exceed three
  columns (a fourth column broke every word in two); embed placeholders name the provider
  ("Open on YouTube", "Open the original") instead of printing its raw id; cover art walks
  its flat families by seed so consecutive covers never repeat; the magazine front page no
  longer opens on the same story twice.
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
