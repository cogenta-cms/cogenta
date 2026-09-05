---
'@cogenta/theme-restaurant': minor
---

Add `@cogenta/theme-restaurant`, a new installable public-site theme (L25 Phase 1) built
on the `@cogenta/theme-kit` foundation: an elegant, dark-forward restaurant identity —
Cormorant Garamond (display) + Jost (body) via Google Fonts, a charcoal/cream palette
with a copper/wine accent, dark by default with a genuinely separately designed light
scheme (never a plain inversion).

All seventeen contract-B blocks, plus a real priced menu: `collectionList` renders a
`menu_item` collection grouped visually by its own `category` field, each row a
`name … dotted leader … price` line (`Intl.NumberFormat(ctx.locale, { style: 'currency',
currency: 'EUR' })`), two columns from 1280px, `description` set in italic. The dotted
leader and its price move together as one wrapping unit so a long dish name on a narrow
screen pushes the price to its own line rather than ever widening the page.

Full-bleed hero with a gradient scrim, a CSS-only mobile menu (`<details>`/`<summary>`,
no JavaScript), masonry gallery, stats, testimonial, an hours/location accordion, and a
map `embed` behind a consent placeholder that never auto-loads third-party content.
Zero client JavaScript, zero literal colour in any stylesheet (verified by test), WCAG AA
contrast checked in both colour schemes, 221 tests.
