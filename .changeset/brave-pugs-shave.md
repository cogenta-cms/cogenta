---
'@cogenta/theme-kit': minor
'@cogenta/theme-canonical': minor
'@cogenta/theme-portfolio': minor
'@cogenta/theme-magazine': minor
'@cogenta/theme-ecommerce': minor
'@cogenta/theme-entreprise': minor
'@cogenta/cli': minor
---

The site's logo, dark logo, favicon and share image now reach the rendered page
(contract D `theme@1.3`, additive).

All four were writable from the admin's Appearance screen, saved, and read back —
and read by nothing else at all. A site that uploaded its logo still served Cogenta's
default favicon and its own name as plain text on every page.

- `@cogenta/theme-kit` gains `ChromeBrand`, the optional `ChromeInput.brand`, and
  `renderBrandMark()` — one `<picture>` with a `prefers-color-scheme` source, the
  site name always written as `alt`. A theme that ignores `brand` renders exactly as
  before; nothing about `theme@1.2` changed.
- The five built-in themes each place the mark in their own chrome (a header bar, a
  masthead nameplate, a storefront bar), never a shared template, and each keeps the
  site name in text somewhere on the page so a failed logo never leaves it unnamed.
- `cogenta serve` resolves the four media ids live per request, through the same
  `/_image` endpoint and the same batch media loader every other image uses. A media
  that is missing, or is not an image, falls back rather than emitting a broken tag.

Two decisions worth knowing:

- `shareImageMediaId` is now a **source for** `seo.defaultSocialImageUrl`, not a rival
  to it: the SEO pipeline still reads one field, and the appearance screen's picker
  wins when it is set. Neither of the two competing settings is left silently dead.
- The favicon fallback is branding-aware. Cogenta's default icon *is* Cogenta's logo,
  so a white-labelled site falls back to its own replacement logo, and to no
  `<link rel="icon">` at all when it has none — rather than getting somebody else's
  mark back in the browser tab.
