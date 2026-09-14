---
'@cogenta/theme-portfolio': minor
---

The Portfolio theme is redesigned for an independent design studio. Archivo,
used across its width axis, sets everything: the studio's statement and
project titles wide and very large, the text and captions at normal width.
The page is black and white with one signal colour, international orange,
kept for the underline of the studio's address, focus rings and text
selection.

What changes on a site:

- The header is one row: the studio's name, its tagline and three or four
  words of navigation. On a phone the navigation opens as a CSS-only
  full-height panel. The footer is a hairline, the name, the address note,
  the menu, social links and the copyright line.
- A page that opens on a `hero` sets its title as the studio's statement,
  across the page, with the subtitle and actions from the seventh column.
- A `grid` listing is the work grid: 3:2 covers edge to edge in an
  asymmetric sequence of six (seven columns beside four with a drop, a full
  row at 2:1, four beside seven), each with its title and a caption line of
  client, discipline and year. The client is left out of the caption when the
  title already names it. A `list` becomes an index of rows (title, client,
  discipline, year), a `carousel` a scrolling strip of covers.
- An entry with a cover outside the `page` collection is set as a project:
  the title, the summary as a statement, the lead visual at full width, then
  a fact sheet in four columns (the year, then each taxonomy of the entry,
  such as client, disciplines and team, with terms linked to their archives).
  Prose over 110 words runs in two columns on wide screens, and figures and
  galleries keep their own ratios, so a case study reads as a sequence of
  mixed image shapes.
- A taxonomy archive is an index of the work filed under the term, with each
  project's summary and year.
- `featureGrid` is a typographic list (rows with a description, or names in
  columns), `cta` the studio's address set very large with an orange
  underline, `quote` a client's line set large, `testimonial` a paragraph to
  be read, `faq` answers set open, `accordion` ruled notes, `stats` and
  `statCounter` figures between hairlines, `pricingTable` engagements as a
  ruled table, `logos` and `logoStrip` marks on plates, `gallery` pictures at
  their own shapes, `embed` a film at the size of a picture. Arrow links carry
  one continuous underline under their words.
- The dark palette is designed on true black with the signal kept, and
  pictures are dimmed slightly. No gradient, shadow on images, hover lift,
  keyframe or scroll-driven animation remains; transitions are capped at
  150 ms.

Class names are new throughout, so custom CSS written against the previous
markup needs updating. An existing site keeps the fonts and colours of its
current skin until that skin is updated: the theme reads its typeface and
palette from the skin, so copy this theme's `tokens.json` into the site's
`theme.tokens.json` (or set the skin's sans to Archivo and its accent to
`#ff4f00`) to get the new typography and palette.
