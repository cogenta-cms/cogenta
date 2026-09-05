# @cogenta/theme-kit

## 0.2.0

### Minor Changes

- 722fc6b: The site's logo, dark logo, favicon and share image now reach the rendered page
  (contract D `theme@1.3`, additive).
  
  All four were writable from the admin's Appearance screen, saved, and read back —
  and read by nothing else at all. A site that uploaded its logo still served Cogenta's
  default favicon and its own name as plain text on every page.
  
  - `@cogenta/theme-kit` gains `ChromeBrand`, the optional `ChromeInput.brand`, and
    `renderBrandMark()` — one `<picture>` with a `prefers-color-scheme` source, the
    site name always written as `alt`. A theme that ignores `brand` renders exactly as
    before; nothing about `theme@1.2` changed.
  - The five built-in themes each place the mark in their own chrome (a header bar, a
    masthead nameplate, a storefront bar), never a shared template, and each keeps the
    site name in text somewhere on the page so a failed logo never leaves it unnamed.
  - `cogenta serve` resolves the four media ids live per request, through the same
    `/_image` endpoint and the same batch media loader every other image uses. A media
    that is missing, or is not an image, falls back rather than emitting a broken tag.
  
  Two decisions worth knowing:
  
  - `shareImageMediaId` is now a **source for** `seo.defaultSocialImageUrl`, not a rival
    to it: the SEO pipeline still reads one field, and the appearance screen's picker
    wins when it is set. Neither of the two competing settings is left silently dead.
  - The favicon fallback is branding-aware. Cogenta's default icon *is* Cogenta's logo,
    so a white-labelled site falls back to its own replacement logo, and to no
    `<link rel="icon">` at all when it has none — rather than getting somebody else's
    mark back in the browser tab.
- befad6d: `theme@1.4` (L25 D2), strictly additive.
  
  `ChromeInput` gains four optional fields — `tagline`, `social` (a `ChromeLink[]`),
  `footerNote`, `headerAction` — plus the new `ChromeLink` interface. `renderSocialLinks(social, options?)`
  renders them as an icon-link list (X, Facebook, Instagram, LinkedIn, YouTube, GitHub, a
  detected Mastodon instance, Bluesky, TikTok, Threads, Pinterest, and a generic fallback),
  each icon paired with visually-hidden label text (`class="cg-visually-hidden"` — a theme
  that renders this must define that class itself; `@cogenta/theme-kit` ships no CSS).
  
  `entryImage(entry, ctx, options?)` reads an entry's cover image from whichever of
  `coverImage`/`cover`/`image`/`featuredImage`/`photo`/`thumbnail`/`seoImage` it declares,
  in that order.
  
  `PageContent` gains an optional `entry: PageEntryMeta` (publishedAt/updatedAt/image/
  excerpt/author/terms/readingMinutes), and the new `entry-header.ts` exports
  `renderEntryHeader(page, ctx, options?)` — the shared way a theme turns that into an
  `<header>` (eyebrow of taxonomy terms, title, excerpt, date/author/reading-time meta
  line, cover). Returns `null` when `page.entry` is absent or the page's own blocks already
  draw a heading (a `hero`), so a theme using it never renders two `h1`s.
  
  `renderIcon(name, options?)` (new `icons.ts`) renders one of ~50 named outline icons as an
  inline `<svg>`, for contract B's `featureGrid.items[].icon` — `null` for an unrecognised
  name, which is a theme's signal to keep whatever fallback it drew before.
  
  Every addition is optional; a theme built against `1.3`, and a host that never wires any
  of the new fields, both keep rendering exactly as before.
  
  Also adds `THEME_STRINGS`/`createThemeTranslator()`: the dozen visitor-facing strings the
  block vocabulary asks for through `RenderContext.t` (`collection.empty`, `embed.open`,
  `entry.readingTime`, …), in English and French with `{{placeholder}}` interpolation and a
  per-theme override hook. Until now `cogenta serve` passed `t: (key) => key`, so an empty
  list printed the literal text `collection.empty` on the public page.
- a6530f6: Taxonomy terms finally have a public page (contract D `theme@1.3`, additive).
  
  ADR-0022 shipped native taxonomies and the admin has let an editor point a menu item
  at a term ever since — and `resolveMenuTerm` answered `route: null` for every one of
  them, honestly, because no site rendered such a page. A term was a filing cabinet with
  no door.
  
  - `GET /{taxonomy}/{term-slug}` lists every published entry filed under a term, newest
    first, across every collection that classifies with it. `?page=N` paginates; page 2
    and beyond are `noindex, follow` with a canonical of their own.
  - `@cogenta/theme-kit` gains `TermArchiveInput` and `ThemeModule.renderTermArchive` —
    **optional**: a theme that does not implement it still serves the page, in its own
    chrome, through a plain host-rendered list. The five built-in themes each implement
    it with their own layout, reusing their own `collectionList` card classes so an
    archive looks like that theme's lists rather than a sixth design.
  - `resolveMenuTerm` returns a real route, so a taxonomy menu item is a link.
  - `/sitemap.xml` lists every term that has something published under it.
  
  Two decisions: the URL pattern is fixed and resolved by the host **after** every real
  collection route has failed to match — so a `/blog/:slug` route can never be shadowed,
  and a taxonomy needs no `routing` of its own (which would have been a contract A
  change ADR-0022 deliberately avoided). And a term archive lists that term only; its
  sub-terms are offered as links rather than folded in, so what the page shows always
  matches the term that was asked for.
- 1995d35: Fiche 42 task 2 — the rich text vocabulary (contract A, ADR-0013) gains a
  `strikethrough` decorator and an `hr` (thematic break) node, both additive:
  `RICH_TEXT_DECORATORS` now includes `'strikethrough'` alongside the existing
  `strong`/`em`/`code`, and `richTextNodeSchema` accepts a third node shape,
  `{ _key: string, _type: 'hr' }`, carrying nothing beyond its key. No existing
  document changes shape — a `richText` value stored before this change parses
  identically after it. A consumer still on the previous minor cannot validate
  a document that uses either addition, the same one-directional compatibility
  already accepted for `schema@2.1`'s `reviewState` and `tools@1.1`'s
  `document.extract`.
  
  `@cogenta/blocks`'s own temporary mirror of the richText shape (used to
  validate a `prose`/`quote`/`testimonial`/`faq`/`accordion` block's body)
  gains the same `hr` node — its `marks` field was already an open string
  array, so `strikethrough` needed no change there.
  
  `@cogenta/theme-kit`'s `renderRichText` — the single function every theme in
  this monorepo imports rather than reimplementing (`@cogenta/theme-canonical`
  and the four site themes' `blocks/prose.ts` all call it directly) — renders
  `strikethrough` as `<s>` (semantically "no longer accurate", not `<del>`,
  which would imply an edit-tracking deletion) and a thematic break as a bare
  `<hr class="cg-prose__rule">`. `@cogenta/theme-canonical` re-exports the
  same function unchanged; its own `prose` block snapshot fixture now
  exercises both additions end to end.
  
  `@cogenta/admin` (private, no changeset) gains the corresponding editor
  support: a strikethrough toolbar button, a horizontal-rule insert button and
  slash-menu entry, Markdown (`~~text~~`, a bare `---` line) and HTML (`<s>`,
  `<hr>`) source-view round-tripping, and clean-paste recognition of `<s>`/
  `<strike>`/`<del>` and a pasted `<hr>` (previously dropped outright).
  
  Same commit also fixes an unrelated, pre-existing CSS bug (fiche 42 task 1):
  `.rich-text-editor__surface` had no `min-height` outside fullscreen, so a
  freshly opened entry's editing area measured exactly one line. `@cogenta/admin`
  only; no published-package surface involved.
- 4335296: Add `resolveBlockForRender` (fiche 43, sous-chantier C(ii)) and `withBlockVariant`
  (sous-chantier D, RFC 0002), both additive exports.
  
  `resolveBlockForRender` finishes wiring `@cogenta/blocks`'s `BlockRegistry` into the
  actual render path: a placed block whose exact type the active theme does not implement
  now follows its declared `fallback` chain and renders as the nearest block the theme does
  implement, rather than a silently blank slot. Every one of the five in-house themes calls
  it once, inside their own `renderBlock`.
  
  `withBlockVariant` stamps a placed block's optional `variant` (`blocks@2.0`, RFC 0002) onto
  the element it rendered to, as one `data-variant-<axis>` attribute per axis actually set —
  a theme's CSS then resolves each to its own token. Both functions are pure and have no
  effect on a block that carries neither a theme-private type nor a `variant`: existing
  content renders unchanged.

### Patch Changes

- a915e1a: Fixes from the final live review of every scaffolded blueprint (L25): the association
  theme's event cards stack their cover over a date + text row and never exceed three
  columns (a fourth column broke every word in two); embed placeholders name the provider
  ("Open on YouTube", "Open the original") instead of printing its raw id; cover art walks
  its flat families by seed so consecutive covers never repeat; the magazine front page no
  longer opens on the same story twice.
- 05f9e29: Fixes `renderSocialLinks`' Instagram, YouTube and Threads icons (and the
  generic fallback "chain link" icon), found while seeding real social links
  on `@cogenta/theme-association`'s own scaffolded site: each of these icons
  draws two nested contours meant to punch a hole in each other (Instagram's
  square frame and its lens, YouTube's frame around its play triangle,
  Threads' loop, the fallback's two link rings) via `fill-rule="evenodd"` —
  but `evenodd` only cancels overlap *within one path's own subpaths*, never
  across sibling `<path>` elements, and each contour was rendered as its own
  separate element. The result was a solid, illegible blob instead of the
  intended ring for every one of these four icons on every theme that uses
  `renderSocialLinks` (this package is shared across all of them). Contours
  meant to subtract from one another are now joined into a single path's `d`;
  shapes meant to sit solid beside a neighbour (a flash dot, a play triangle)
  stay their own element so they are never accidentally cancelled by it.
- Updated dependencies [4335296]
- Updated dependencies [7a59646]
- Updated dependencies [562c9c1]
- Updated dependencies [a15b1ae]
- Updated dependencies [86fc9cf]
- Updated dependencies [54409f3]
- Updated dependencies [1995d35]
  - @cogenta/blocks@1.0.0
  - @cogenta/render@0.2.0
