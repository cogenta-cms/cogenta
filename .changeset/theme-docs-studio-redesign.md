---
'@cogenta/theme-docs': minor
---

The documentation theme is redesigned for first-class technical documentation:
white and a cool grey scale, a near-black ink and one deep petrol teal kept for
links, the page being read and focus, with IBM Plex Sans for everything a reader
reads and IBM Plex Mono for code.

What changes on a site:

- **A documentation page** has three columns on a wide screen: the navigation,
  held in view as the page scrolls and grouped by section with the current page
  marked; the article, with a breadcrumb, the title, the entry's summary under
  it, and the date the page last changed; and "On this page", built from the
  article's own headings. The table of contents goes below 80rem, and below
  64rem the navigation folds into a disclosure at the top of the article that
  names the current section and page. Previous and next links at the bottom
  follow the documentation's reading order. The navigation now orders sections
  by the smallest `order` they hold, so a section never jumps when two pages
  were created in the same millisecond.
- **Running text** reads four shapes an editor can already write, and renders
  them as documentation furniture. Every other theme keeps rendering the same
  data as ordinary paragraphs and lists:
  - a paragraph whose spans are all marked `code` is a code block; when its
    first span is also bold, that span is the block's label (a file name, or
    "Terminal"). Long lines scroll inside the block, comment lines are set as
    comments, and in a shell example the `$ ` prompt cannot be selected and
    program output is set apart;
  - a blockquote opening on a bold "Note", "Tip", "Important", "Warning" or
    "Caution" is a note (teal rule for notes and tips, ink rule otherwise);
  - a bulleted list whose items all open on a span marked only `code` is a
    reference table: the term, an optional italic type or default, and the
    description, aligned in columns between hairlines;
  - inline code holding a key or a key chord (`Ctrl+C`) is set as keys.
  `h2` and `h3` headings get an id and link to themselves.
- **The home page hero** carries a large search field: a real `GET /search`
  form, no script. The header carries a compact one, the top sections, and on a
  phone a search link and a menu that opens without a script.
- `featureGrid` is short entries hanging from hairlines in up to four columns,
  without icon tiles; a `collectionList` of `doc_page` entries is the whole
  documentation in one column per section; other lists are ruled indexes or
  columns of framed pictures. `faq` answers in the open beside its title,
  `accordion` is ruled rows, `stats` and `statCounter` ruled figures in tabular
  numerals, `pricingTable` plans side by side between hairlines, `cta` a close
  between two rules, and `quote`/`testimonial` a quotation hanging from an ink
  rule.
- The footer is organised in columns: an unlinked item
  (`submenu-placeholder`) in the footer menu starts a column and names it. The
  legal line prints the copyright year and the product's name.
- The dark palette is designed for reading code: a cool near-black ground, code
  raised a step above it, soft white text and a lifted teal; diagrams are
  dimmed slightly. No shadow, gradient, blur, pill or scroll animation remains,
  and the search results and term archive pages align with the rest of the site.

Class names are new throughout (`cd-` prefix), so custom CSS written against the
previous markup needs updating. An existing site keeps the fonts and colours of
its current skin until that skin is updated: the theme reads both from the skin,
so copy this theme's `tokens.json` into the site's `theme.tokens.json` (or set
the skin's sans to IBM Plex Sans and its mono to IBM Plex Mono) to get the new
typography and palette.
