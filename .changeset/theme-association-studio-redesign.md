---
'@cogenta/theme-association': minor
---

The Association theme is redesigned for a neighbourhood charity people trust
with their food, their children's homework and their Saturday mornings.
Bricolage Grotesque sets what a visitor reads first (the statement of the
cause, titles, figures, dates, quotations), with its optical size following the
font size and its width axis narrowing the largest sizes; Source Sans 3 sets
running text, navigation, times and places. The page is warm paper and a
green-black ink. One deep green is the organisation's own colour (links,
figures, bars, the filled button, the footer band), and one signal yellow is
kept for the donation ask: the header action, the hero's first action and the
call-to-action band. Corners are square on photographs and softened by a hair
on buttons. Light follows the visitor's setting; the dark palette is designed
(a deep green-black ground, a pale sage for the green, the same yellow).

What changes on a site:

- The header is one row under a hairline: the organisation's name or logo, the
  pages in words, the header action as the yellow button, and the light/dark
  control. On a phone the donation button stays in the row, and the pages open
  from a "Menu" button (CSS only) as a full-height panel of large links with
  the tagline under them. The footer is the green band: name, tagline, the
  footer note with its line breaks kept (a registered charity number, an
  address, a telephone number), social profiles with their names, the footer
  menu in columns (an unlinked menu item starts and names a column), and the
  copyright line.
- A `hero` shows the photograph across the whole window. The statement of the
  cause is set on a sheet of the page's paper that rises into the bottom of
  the photograph, with the subtitle and the actions beside it. Text is never
  laid over the picture.
- A `collectionList` whose entries all carry a date (`startsAt`, `start`,
  `date` or `eventDate`, with `endsAt` or `end`) is a calendar in date order:
  a typographic date block (month, day, weekday), the title, the hours and the
  place, the summary, and the `cost` when there is one. Entries with pictures
  are alternating rows of picture and words in a `list` (with `schedule`,
  `location`, `address` and `audience` when the entry has them) and photo cards
  in a `grid`; anything else is a ruled index. A list never shows the page it
  is on.
- An entry page uses contract D `theme@1.5` fields. An event opens on a large
  date block with the year, its title and summary, and its practical details
  (when with the hours, where with the street address, cost, booking), then
  its photograph. Any other entry with details or a picture (a programme)
  opens on its title, summary and details with the photograph beside or under
  them. Contacts that are email addresses or telephone numbers become links.
  Times are read in UTC, as stored, and written the way the charity's copy
  writes them: "6pm to 7.30pm" for a locale whose clock is twelve-hour, "18:30"
  for one whose clock is twenty-four-hour, chosen from the page locale through
  `Intl`. A host older than `theme@1.5` gets a
  plain page header.
- `stats` items are figures with their sentence of context; `stats` and
  `statCounter` items that are percentages adding up to a whole are drawn as a
  breakdown with a bar each. A `cta` is the yellow ask band, and when its text
  lists gifts sentence by sentence ("£5 a month buys the bread for one
  Thursday.") the amounts are set beside what they pay for; with the
  `background` variant it is a quieter band on the paper's darker stock.
- `featureGrid` items with icons are ruled columns; without icons they are
  numbered steps. `testimonial` sets the person's portrait at 4:5 beside their
  words, `quote` is large with a hanging opening mark, `faq` prints every
  answer in two columns, `accordion` is a list of details rows, `pricingTable`
  is ruled columns of giving levels, `logos` and `logoStrip` set partner marks
  in one ink (inverted in the dark), `gallery` composes one, two, three, four
  or more pictures without gaps, and `embed` is a short notice card that
  contacts no third party before consent.
- Every block renders in full on load. The fade-in on scroll is gone, and so
  are gradients, shadows, halos, pill badges, icon tiles, hover lifts and
  keyframes; transitions are capped at 150 ms.

Class names are new throughout, so custom CSS written against the previous
markup needs updating. An existing site keeps the fonts and colours of its
current skin until that skin is updated: the theme reads its typefaces and
palette from the skin, so copy this theme's `tokens.json` into the site's
`theme.tokens.json` (or set the skin's serif to Bricolage Grotesque, its sans
to Source Sans 3 and its accent to `#1d5b3e`) to get the new typography and
palette.
