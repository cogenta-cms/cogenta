---
'@cogenta/theme-canonical': minor
---

The default theme is redesigned as an exemplary, sector-neutral default: pure
neutrals, a near-black ink and one deep blue kept for links and the focus ring,
Instrument Sans for everything a visitor reads and every heading, and
Instrument Serif for the one display line of a page (a hero title, a page
title) and for quotations. Every page is laid on a twelve-column grid inside a
72rem page, from one left edge, with one vertical rhythm between blocks.

What changes on a site:

- The hero sets its title large in the display face, the subtitle and the
  actions under it, then its photograph across the page. The tinted disc
  behind the picture, the pill badge, the rounded shadowed image and the
  fade-in on scroll are gone. A primary action is a button in ink; a secondary
  action is an underlined link with an arrow.
- A titled section opens under a rule in ink. `featureGrid`, `stats` and
  `pricingTable` are columns under hairlines rather than cards; `faq` sets its
  title beside the questions on a wide screen, `accordion` under them, both
  with a plus that turns into a minus. `statCounter` shows its figures in the
  display face. `cta` is a band a step off the page with the actions at the
  end of the row. `testimonial` and `quote` are set against the page, with
  real quotation marks. `logos` and `logoStrip` show wordmarks in greyscale
  (turned light in the dark). An `embed` waiting for consent is a short note
  on a band instead of a frame-sized grey box.
- `pricingTable` lines prices, feature lists and buttons up across plans, says
  "Recommended" on the highlighted plan, and gives an unset action the filled
  button on the recommended plan and an outline on the others.
- `collectionList`: `list` is a dated index; `grid` and `carousel` open each
  entry on its picture only when every entry has one, and are set in type
  alone otherwise, so no row shows a hole. Dates read as long dates in the
  page's language everywhere, the term archive included.
- The entry header, the term archive, the search page, public forms and the
  comment thread are designed on the same grid.
- The header is a bar on the page's own ground that scrolls away, with the
  header action as its one filled button, the light/dark control, and a
  CSS-only menu on a phone (a visible "Menu" control, the action at the foot of
  the panel). The footer is a band with the site's name, tagline, note and
  social links beside the footer menu in columns (an unlinked menu item starts
  a column and names it), and a legal line with the year and the site's name.
- The dark palette is designed: a near-black ground taken from the skin's own
  ink, lightness steps for bands and the footer, a lifted accent, and
  photographs dimmed slightly. No shadow, gradient, blur, pill or scroll
  animation remains; transitions are capped at 150 ms.

Class names a host or a test relies on are unchanged (`cg-main`,
`cg-page__title`, `cg-site-header`, `cg-skip-link`, every `data-block`,
`data-block-key` and `data-field` hook of the page builder); the chrome's inner
markup and a few block internals are new, so custom CSS written against them
may need updating. `footerGroups` is a new export.

The theme's stylesheet now loads Instrument Sans and Instrument Serif from
Google Fonts, and the default skin (`tokens.json`, which new `blank` sites
copy) names them. An existing site keeps the fonts and colours of its current
skin until that skin is updated: copy this theme's `tokens.json` into the
site's `theme.tokens.json`, or set the skin's sans to Instrument Sans and its
serif to Instrument Serif, to get the new typography and palette.
