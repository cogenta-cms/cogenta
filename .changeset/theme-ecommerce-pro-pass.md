---
"@cogenta/theme-ecommerce": minor
---

L25 "templates pro" passe pro: `@cogenta/theme-ecommerce` now consumes
`theme@1.4` in full — a sticky header with a real desktop nav, a CSS-only
mobile menu (checkbox + `<label>`, not `<details>`: a *closed* `<details>`
cannot render its non-`<summary>` content at all in current Chrome, so a
header with only ever one nav panel avoids that failure mode outright
rather than working around it), a `headerAction` button, and a real
four-column footer (brand + tagline, footer nav, social links via
`renderSocialLinks`, and a fourth column carrying the footer note above
`brandingHtml`). Every one of the four fields stays optional and additive —
a render that sets none of them is byte-for-byte the previous chrome.

The product grid (`collectionList`) now shows what a shopper actually
compares: `entryImage` as a square photo, a formatted price
(`Intl.NumberFormat` in the page's own locale), a flat "Out of stock" badge
when `inStock === false`, and a category chip — all raw contract-A data,
read by field-name convention (never a new contract requirement), so a
collection with none of those fields still renders a correct card (image,
title, excerpt). `featureGrid` now renders a real inline icon
(`renderIcon`) instead of an empty decorative chip. `gallery` shows each
item's own image `alt` text as a flat caption band when the media entity
has one — the mechanism this theme's category tiles use, since contract
B's `gallery` item carries no caption field of its own. A routed
collection with no `blocks`/`richText` field of its own (this theme's
`product`) now draws `renderEntryHeader`'s furniture (title, cover photo,
excerpt) on its own page — `price`/`inStock`/`category` stay on the grid
card, `PageEntryMeta` having no room for schema-specific fields.

Zero gradients, zero decorative blur (D5) — everywhere.
