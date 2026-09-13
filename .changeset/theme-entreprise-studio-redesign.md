---
'@cogenta/theme-entreprise': minor
---

The Entreprise theme is redesigned for a management consultancy or any firm
that sells judgement: an editorial twelve-column grid, Newsreader for titles
and Hanken Grotesk for text, hairlines instead of boxes and shadows, and one
deep green accent spent sparingly.

What a site owner will see:

- A typographic hero: a small-capital line under a short rule, a large serif
  title, then the introduction and actions beside a frankly cropped photograph.
- `featureGrid` becomes a numbered list of practices (01, 02…) between
  hairlines, with its title held in the left columns. Icons are no longer drawn.
- `stats` sets key figures in one row between vertical rules; `statCounter`
  sets them as a ruled table beside its title.
- `collectionList` in the `list` layout shows alternating image and text rows
  (a case-study register); `grid` is a three-column editorial index; an entry
  without a picture becomes a typographic row rather than a card with a gap.
- `testimonial` is a large serif pull quote with a small black-and-white
  portrait; `quote` is a quieter italic quotation in the reading column.
- `faq` keeps its title in view on the left while the questions scroll on the
  right; `accordion` numbers its steps across the full width.
- `cta` is an ink band across the page; in dark mode it becomes a raised ink
  surface between hairlines.
- `logoStrip` and `logos` show client marks in greyscale (lifted in dark mode);
  `logos` is a ruled register whose column count fills whole rows.
- `prose` is a reading column whose second-level headings hang in the left
  margin on wide screens.
- The footer is a colophon: name and tagline, footer links, the footer note
  set as blocks (separate office addresses with blank lines and each first
  line becomes a label), social icons, and a `© year name` legal line.
- Reading time is shown on an entry only when it is three minutes or more.
- The dark palette is redesigned on deep ink surfaces with ivory text.

Your content is unchanged; every block keeps its contract. A site whose skin
still names the previous fonts (Archivo, Source Serif 4) keeps them until the
skin is updated: the theme's own `tokens.json` now names Newsreader and Hanken
Grotesk. Nothing moves or fades in on scroll any more, and no stylesheet uses
`animation-timeline`.
