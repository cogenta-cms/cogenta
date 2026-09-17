---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/theme-kit': minor
'@cogenta/cli': minor
'@cogenta/theme-canonical': patch
'@cogenta/theme-association': patch
'@cogenta/theme-blog': patch
'@cogenta/theme-docs': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
'@cogenta/theme-restaurant': patch
'@cogenta/theme-saas': patch
---

Embed previews: an embedded video shows its title and thumbnail, without calling the provider for the visitor

An embed address is resolved through the provider's fixed oEmbed endpoint (YouTube, Vimeo,
Dailymotion, Spotify, SoundCloud, Bluesky) — never an address a user supplied, redirects
refused, thumbnails only from the provider's image hosts, as an image, under 2 MB. What it
says is cached (`@cogenta/schema`'s `cogenta_embed_previews` table), and its thumbnail is
copied into the site's storage and served at `/_cogenta/embeds/{hash}`.

`@cogenta/api` adds `resolveEmbed`, `createEmbedPreviewService` and `POST /api/embeds/resolve`
— for accounts that can update a collection, 30 a minute each — and `@cogenta/core` the
`EMBED_URL_INVALID` and `EMBED_RATE_LIMITED` codes. A thumbnail is stored under the hash of its
bytes, so variants of one address share one file. `cogenta serve` loads
the page's previews before rendering and resolves missing ones in the background — a render
never waits on the network. Contract D `theme@1.9`, additive: `RenderContext.embedPreview`,
with `embedFrameTitle` and `renderEmbedPreview` in `@cogenta/theme-kit`; every theme names its
player by the title and shows the preview on its consent card. Contract B is unchanged.
