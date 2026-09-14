---
'@cogenta/theme-magazine': minor
---

The Magazine theme is redesigned as a serious news and culture daily: Fraunces
for the nameplate and every headline, Source Serif 4 for the text, and Libre
Franklin for kickers, bylines, dates, navigation and captions, on white
newsprint in black ink with one editorial red kept for section kickers and a
few rules.

What changes on a site:

- The masthead has three rows: a thin bar with today's date, the tagline, the
  header action and the light/dark control; the nameplate, centred; and the
  sections in spaced capitals between a double rule and a hairline. On a phone
  the sections open as a CSS-only full-height panel and the header action stays
  visible in the bar.
- A page that opens on an untitled `grid` listing is set as a front page: the
  first story across eight columns with its photograph, three briefs beside it
  behind a column rule, and the next stories in a row of four divided by
  hairlines. A titled `grid` becomes a section rail, a `carousel` becomes a
  strip of columns (the opinion strip, with the columnist in the kicker), and a
  `list` becomes a numbered ranked list. Kickers come from a plain-text
  `kicker` field (or `section`/`category`/`topic` when they hold text); a
  taxonomy id is never shown.
- An entry with a date, a standfirst, a cover or terms is set as an article:
  its section term as a red kicker linking to its front, a very large headline,
  an italic standfirst, a byline built from `author`/`authors` taxonomy terms
  (each linked to its archive) and the date between hairlines, then the lead
  photograph. When the body opens with a `mediaFigure`, that figure, with its
  caption and credit, is the lead photograph instead of the uncaptioned cover.
  The text sits in a 66-character column with display subheads, pull quotes
  hanging to its left, and a two-line drop cap where the browser supports a
  true initial letter.
- A taxonomy archive is set as a section front in type: the term very large on
  a double rule, then the same lead, briefs and row composition.
- `featureGrid` is a contents panel with column rules and no icons, `cta` an
  appeal between a double rule and its actions, `faq` a reader's guide set
  open, `accordion` collapsible ruled notes, `stats` figures between rules,
  `statCounter` a ruled table, `pricingTable` subscription rates as a ruled
  table, `logos` and `logoStrip` marks in one tone, `gallery` a picture spread.
- The colophon repeats the nameplate over four dense columns and a legal line
  with the copyright year. The dark palette is designed on ink with the red
  lifted for contrast, and photographs are dimmed slightly on ink.
- Every scroll-driven entrance animation is gone, so a full-page capture, a
  print or a crawler sees the whole page. No shadow, gradient, pill or hover
  lift remains; transitions are capped at 150 ms.

Class names are new throughout, so custom CSS written against the previous
markup needs updating. An existing site keeps the fonts and colours of its
current skin until that skin is updated: the theme reads the display and
interface faces and the palette from the skin, so copy this theme's
`tokens.json` into the site's `theme.tokens.json` (or set the skin's serif to
Fraunces and its sans to Libre Franklin) to get the new typography and palette.
