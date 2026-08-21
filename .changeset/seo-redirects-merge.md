---
'@cogenta/seo': minor
'@cogenta/api': minor
'@cogenta/schema': minor
'@cogenta/cli': minor
---

Fiche 21, task 3 — merge SEO + Redirections into one admin screen, and make sitemap/social/title settings real and admin-editable (previously "read-only by design", a scope choice of a previous lot rather than an ADR).

- **`@cogenta/seo`**: `MetadataOptions` gains `fallbackImage` — a site-wide default Open Graph/Twitter Card image, used by `buildMetaTags` only when neither the caller's own `image` nor the resource's `seoImage`/first `media` field resolves to anything. `SitemapOptions` gains `collectionOverrides` (new exported type `SitemapCollectionOverride`) — per-collection `included`/`changefreq`/`priority`, applied by `sitemapUrlsFor`; `included: false` drops every entry of that collection from the sitemap outright.
- **`@cogenta/api`**: `SeoRouterOptions.titleTemplate`/`collectionTitleTemplates` (static, and never actually wired to anything — dead since the fields were added) are replaced by `titleDefaults`, an async getter read fresh on every diagnostic scan and SEO preview, mirroring the "read live, never cached at startup" contract `@cogenta/cli`'s `ThemeRenderOptions.homePath` already uses. **Breaking** for any direct caller of `createSeoRouter` passing the old static fields.
- **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY` gains a `seo` group — `seo.titleTemplate`, `seo.collectionTitleTemplates`, `seo.defaultMetaDescription`, `seo.sitemapCollectionSettings`, `seo.twitterHandle`, `seo.defaultSocialImageUrl` — persisted through the same `SiteSettingsStore` `settings.tsx`'s Général/Reading/Discussion tabs already use, no new table or migration.
- **`@cogenta/cli`**: `seo.ts` gains `SeoRenderDefaults`/`readSeoRenderDefaults` (reads the six settings above, live); `seoSiteFor` and `HeadOptions`/`renderSeoHead` take an optional `seo`/`SeoRenderDefaults` to apply the title template, per-collection template override, default meta description, Twitter handle and fallback social image; `buildSitemapFiles` takes an optional `collectionOverrides`. `ThemeRenderOptions` gains `seo?: () => Promise<SeoRenderDefaults>`, wired into every render path in `cogenta serve` (published page, page-builder preview, admin SEO preview redirect check, `/sitemap.xml`) so a saved setting shows up on the very next request, no restart.

Admin (`@cogenta/admin`, private, no changeset): `/seo` and `/redirects` merge into one nav entry ("SEO") with five tabs — Général, Sitemap, Réseaux sociaux, Redirections (the previous `redirects.tsx` screen, unchanged, now `RedirectsPanel`), Diagnostic (the previous read-only reports, unchanged, now loaded lazily only when that tab is opened). `/redirects` still resolves (redirects to `/seo?tab=redirects`), the same pattern already used for `/site-plan` → `/create-site`.
