---
'@cogenta/theme-restaurant': minor
---

The Restaurant theme is redesigned for a contemporary bistro with serious
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
