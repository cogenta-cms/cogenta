---
"@cogenta/api": patch
---

Fixes a real bug found while verifying the `saas` blueprint (L25):
`collectDependencies` (`rest/dependencies.ts`) walked a block's `json`
fields for a nested media reference named `media` (gallery items, logo
items) but missed `testimonial.attribution.avatar`, the one nested shape
that names it `avatar` instead — matching `quote`'s own top-level field of
the same name. A page whose only image reference was a testimonial's avatar
served a 500 (`THEME_IMAGE_UNSUPPORTED`: the avatar was never declared a
dependency, so it was never pre-loaded before render) and, more generally,
never tagged that avatar as a cache/render dependency at all.
