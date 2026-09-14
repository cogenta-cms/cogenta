---
'@cogenta/theme-saas': minor
---

The SaaS theme is redesigned for a serious piece of business software: white
and a structured grey scale, a near-black ink and one signal blue kept for
links, focus and the primary button, with Geist for everything a visitor reads
and Geist Mono for what software prints (eyebrows, dates in an index, units,
step numbers, the label of a recommended plan).

What changes on a site:

- The hero is left-aligned: a short title set large, the subtitle and the
  actions under it, then the product screenshot across the twelve columns in
  a single hairline frame. The mesh background, the badge, the offset shapes
  and the glows are gone. On a phone the screenshot is cropped to a readable
  part of the interface.
- `featureGrid` has two readings chosen from its data: with icons, a grid of
  three columns with a small stroke icon beside each title and no tiles; with
  no icons, a numbered sequence of steps hanging from hairlines.
- `pricingTable` becomes a ruled comparison. Feature lines written as
  `Label: value` become rows with one value per plan, and plain lines become
  rows checked where a plan lists them. Plans that cannot be compared are
  shown as ruled columns with their own lists. The recommended plan is marked
  with a "Recommended" label and a rule in ink, never a tinted card. On a
  phone the table scrolls sideways inside its own region.
- A `collectionList` in the `list` layout becomes a product tour (screenshot
  and words, alternating sides) when its entries have pictures, and a ruled
  index with the date in Geist Mono when they do not, as a changelog prints
  it. The `grid` and `carousel` layouts are columns without cards.
- `stats` is a ruled row of figures with their units, `statCounter` a ruled
  strip, `testimonial` one customer's words with a framed portrait, `faq` two
  columns of open answers, `accordion` ruled rows, `logoStrip` a caption above
  wordmarks set at one height and greyed (inverted in the dark), and `cta` a
  sober close under a hairline. A page without a hero opens on its title, the
  entry's date and summary, and its screenshot.
- The header is a sticky bar on the page's own ground under a hairline, with
  the header action as the one filled button and a CSS-only mobile menu. The
  footer is organised in columns: an unlinked item (`submenu-placeholder`) in
  the footer menu starts a column and names it.
- The dark palette is designed: a near-black ground taken from the ink,
  lightness steps for bands and panels, a lifted blue, and screenshots dimmed
  slightly. No shadow, gradient, blur, pill or scroll animation remains;
  transitions are capped at 150 ms.

Class names are new throughout (`cs-` prefix), so custom CSS written against
the previous markup needs updating. An existing site keeps the fonts and
colours of its current skin until that skin is updated: the theme reads both
from the skin, so copy this theme's `tokens.json` into the site's
`theme.tokens.json` (or set the skin's sans to Geist and its mono to Geist
Mono) to get the new typography and palette.
