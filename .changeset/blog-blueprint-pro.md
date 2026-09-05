---
'create-cogenta': minor
---

The `blog` blueprint (L25 D4) now activates `@cogenta/theme-blog` by default (writes
`cogenta_theme.active_theme` and the theme package into the generated site's
`package.json`, no admin action needed), seeds a warm-paper/ink-blue starting skin
matching that theme's identity (`starting-skins.ts`, new `blog` key), and composes a
real eight-block home page (a featured-post hero, a "Latest" grid, a "Topics" icon rail,
a reader quote, a "From the archive" list, a newsletter panel, an "As featured in" press
strip, and an FAQ) instead of the previous three-block placeholder.

Eight published demo posts (up from three), each with a real procedural cover image
(`demo-art`, ingested through the real media pipeline) and classified under one of four
categories and one or more of eight tags (up from two categories / three tags); header
(Home/Writing/About) and footer (About/Archive/RSS) menus plus a "Subscribe" header
action; `general.tagline`/`general.socialLinks`/`general.footerNote` seeded.

`post` now declares `publishedAt: f.datetime()` (the same field `docs/04-contrats.md`'s
own contract-A example shows) — without it, `createContentStore`'s publish-time default
never fires (it is conditioned on the collection declaring the field), so every post's
`renderEntryHeader` meta line silently had no date, only a byline and reading time.

Breaking for anything that imported the blueprint's old fixed exports: `BLOG_DEMO_PAGES`
is replaced by `buildBlogDemoPages(media)`, a function of the seeded media map — the
same shape the `store` blueprint's `buildStoreDemoPages` already uses, since the home
page's hero backdrop and quote avatar are real seeded images now, not literals a static
constant could hold. `BLOG_DEMO_POSTS`/`BLOG_DEMO_CATEGORIES`/`BLOG_DEMO_TAGS` keep their
previous shape, with new content.
