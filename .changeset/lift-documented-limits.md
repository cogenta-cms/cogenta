---
'@cogenta/schema': minor
'@cogenta/render': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Lift five limits that were documented rather than fixed

- **Search and replace** now finds a phrase cut in two by a formatting run: a paragraph's
  spans are joined to search, and the text is written back into the spans it came from —
  every span keeps its marks and its key, and a replacement straddling a boundary takes
  the formatting of the span it starts in.
- A replacement can be **undone as a whole**: the report carries the version each entry
  stood at before the write, restored through the ordinary restore route.
- **Mirroring an image** (left-right, top-bottom) joins the quarter turns, on both driver
  tiers, with the focal point carried through it. `sharp` mirrors before it rotates
  whatever the call order, so the axis is compensated — the two tiers produce the same
  pixels, which a contract test pins.
- **An embed preview can be refreshed** without waiting out its thirty days
  (`refresh: true`), for a title that changed at the source.
- **The 404 and start pages** speak Spanish, German, Italian, Portuguese and Dutch beside
  English and French, matched on the language subtag.

Kept, with their reasons: Mastodon embeds (an arbitrary instance host is the SSRF the
closed oEmbed list exists to prevent), free-angle rotation (it interpolates, and both
tiers would have to produce identical pixels), and inline editing of rich text in the page
builder.
