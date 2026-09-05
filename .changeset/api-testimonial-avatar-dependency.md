---
"@cogenta/api": patch
---

Fixes `collectDependencies`' scan of a block's list-item media references:
it looked only for a property literally named `media` (gallery items, logo
items), missing `testimonial`'s own `attribution.avatar`
(`blocks@2.0`, RFC 0001) — the one vocabulary shape that names its media
reference `avatar`. A testimonial with an avatar was never declared as a
dependency of the response it appeared in, so `cogenta serve`'s render
pipeline (which only preloads media a page actually depends on) never
fetched it — every real render of a page carrying such a testimonial
failed with `THEME_IMAGE_UNSUPPORTED`, found end to end while verifying
`@cogenta/theme-association`'s own scaffolded site.
