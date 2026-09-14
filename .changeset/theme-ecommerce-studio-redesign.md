---
'@cogenta/theme-ecommerce': minor
---

The E-commerce theme is redesigned for a small brand of durable everyday
goods. Albert Sans sets everything, light and large for headlines, regular for
text, medium for names and prices. The page is sand and warm ink, with a stone
band for the footer and one terracotta kept for focus rings, text selection and
the underline of links in running text. Corners are square, and structure is
drawn with space and hairlines.

What changes on a site:

- The header is one row under a hairline, held at the top of the window: the
  shop's name or logo, the navigation in words and the header action as an
  underlined link. There is no cart, search or account control. On a phone the
  navigation opens as a CSS-only full-height panel of large links. The footer
  is a stone band with the name, tagline and address note, the footer menu,
  social profiles with their names, and the copyright line.
- A `hero` sets its headline on the grid, with the subtitle and one action
  beside it, and the photograph across the whole window underneath. Text is
  never laid over the picture.
- A `collectionList` whose entries all carry a numeric `price` is a product
  grid: photographs at 4:5, four across on a wide screen and two on a phone,
  the name and the price under each in tabular figures, and "Sold out" as a
  plain line of text when `inStock` is false. Entries with a picture and no
  price (categories, for example) are square tiles named by an arrow link;
  anything else is a ruled index. A list never shows the page it is on.
- A product page now uses contract D `theme@1.5` fields: the photograph on
  seven columns, and beside it, held in view, the category, name, price, stock
  status, short description, an order action, a delivery note and the details
  (`material`, `dimensions`, `weight`, `capacity`, `origin`, `care`). The theme
  draws no "Add to cart". The action comes from the entry's `orderLink`: an
  email address reads "Order by email" (or "Ask about the next batch" when sold
  out), any other link "Order this piece", and `orderLabel` overrides the
  wording. Prices use the entry's `currency` code and fall back to euros. A host
  older than `theme@1.5` gets a plain page header instead.
- `featureGrid` items without a sentence become one ruled line of statements
  (delivery, returns, repairs); with sentences they are ruled columns with a
  small line icon and no tile. `mediaFigure` aligned `start` or `end` is a
  split of photograph and caption, `cta` a line under an ink rule, `faq` and
  `accordion` details rows beside a held title, `quote` and `testimonial` words
  set large and light with a hanging opening mark, `stats` and `statCounter`
  figures under hairlines, `pricingTable` ruled columns, `logos` and
  `logoStrip` marks along one row, `gallery` squares, masonry or a scrolling
  row, `embed` a frame that contacts no third party before consent.
- Page headers show the title, and an entry's summary beside it. Date, author
  and reading time appear only for dated entries.
- The dark palette is a deep warm brown-black with sand type and a lifted
  terracotta; photographs are dimmed slightly. No gradient, shadow, hover lift,
  keyframe or scroll-driven animation remains, and transitions are capped at
  150 ms.

Class names are new throughout, so custom CSS written against the previous
markup needs updating. An existing site keeps the fonts and colours of its
current skin until that skin is updated: the theme reads its typeface and
palette from the skin, so copy this theme's `tokens.json` into the site's
`theme.tokens.json` (or set the skin's sans to Albert Sans and its accent to
`#9a4a2e`) to get the new typography and palette.
