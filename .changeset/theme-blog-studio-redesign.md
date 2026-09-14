---
'@cogenta/theme-blog': minor
---

The Blog theme is redesigned as a personal publication made for reading:
Literata for everything a reader reads (titles, essays, standfirsts,
quotations, at the optical size drawn for each size) and Figtree for
everything a reader uses (navigation, dates, labels, buttons), on a warm paper
with a warm near-black ink and one ink-blue accent kept for links.

What changes on a site:

- The page is a twelve-column grid with a margin: dates, years, labels and
  attributions sit in the first three columns, and every block starts its text
  on the same line.
- A `collectionList` in the `list` layout becomes an editorial index: the date
  in the margin, the year once at the head of each year, the title and
  standfirst, and a picture only for the entries that have one. The `grid` and
  `carousel` layouts become a ruled shelf. A taxonomy archive uses the same
  index.
- An entry with a date, a standfirst, a cover or terms is set as an essay: the
  topic, date and reading time in the margin beside a large title, the cover
  at 3:2, a 68-character reading column with pull quotes, captioned figures
  and a small-capitals `h4` for notes, and the terms it is filed under at the
  end. A reading time under two minutes is no longer shown.
- `featureGrid` is drawn as a table of contents without icons, `cta` as an
  invitation between two rules, `faq` with its title held in the margin, and
  the other blocks in the same register. Comments get baseline form fields.
- The header no longer sticks to the top of the window, its call to action is
  an outlined control, and the mobile menu is a CSS-only panel. The footer is
  a short colophon with the copyright year and real social icons.
- The dark palette is redesigned on warm ink surfaces, and photographs are
  dimmed slightly on ink. No shadow, gradient, pill or scroll animation
  remains; transitions are capped at 150 ms.

Class names are new throughout, so custom CSS written against the previous
markup needs updating. An existing site keeps the fonts and colours of its
current skin until that skin is updated: the theme reads both from the skin,
so copy this theme's `tokens.json` into the site's `theme.tokens.json` (or set
the skin's serif to Literata and its sans to Figtree) to get the new
typography and palette.
