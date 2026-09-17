---
'@cogenta/starters': minor
---

Give the `blog` blueprint a `topic` field and a carousel section, to exercise the blog theme's new listing forms.

`post` gains an optional plain-text `topic` field (mirroring the `magazine` blueprint's
own `kicker` field), populated on the ten demo posts, so `@cogenta/theme-blog`'s new
small-caps topic label shows real content on a scaffolded site rather than staying
empty. The home page gains a `carousel`-layout `collectionList` ("A few more essays"),
since nothing in the blueprint previously used that layout — the blog theme's new
`strip` form had no demo content to render.
