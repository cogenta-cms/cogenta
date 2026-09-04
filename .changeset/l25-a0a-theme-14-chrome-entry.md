---
'@cogenta/theme-kit': minor
---

`theme@1.4` (L25 D2), strictly additive.

`ChromeInput` gains four optional fields — `tagline`, `social` (a `ChromeLink[]`),
`footerNote`, `headerAction` — plus the new `ChromeLink` interface. `renderSocialLinks(social, options?)`
renders them as an icon-link list (X, Facebook, Instagram, LinkedIn, YouTube, GitHub, a
detected Mastodon instance, Bluesky, TikTok, Threads, Pinterest, and a generic fallback),
each icon paired with visually-hidden label text (`class="cg-visually-hidden"` — a theme
that renders this must define that class itself; `@cogenta/theme-kit` ships no CSS).

`entryImage(entry, ctx, options?)` reads an entry's cover image from whichever of
`coverImage`/`cover`/`image`/`featuredImage`/`photo`/`thumbnail`/`seoImage` it declares,
in that order.

`PageContent` gains an optional `entry: PageEntryMeta` (publishedAt/updatedAt/image/
excerpt/author/terms/readingMinutes), and the new `entry-header.ts` exports
`renderEntryHeader(page, ctx, options?)` — the shared way a theme turns that into an
`<header>` (eyebrow of taxonomy terms, title, excerpt, date/author/reading-time meta
line, cover). Returns `null` when `page.entry` is absent or the page's own blocks already
draw a heading (a `hero`), so a theme using it never renders two `h1`s.

`renderIcon(name, options?)` (new `icons.ts`) renders one of ~50 named outline icons as an
inline `<svg>`, for contract B's `featureGrid.items[].icon` — `null` for an unrecognised
name, which is a theme's signal to keep whatever fallback it drew before.

Every addition is optional; a theme built against `1.3`, and a host that never wires any
of the new fields, both keep rendering exactly as before.
