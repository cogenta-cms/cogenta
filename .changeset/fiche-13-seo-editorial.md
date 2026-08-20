---
'@cogenta/seo': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Add editorial SEO controls: the conventional `seoTitle`/`seoDescription`/`seoImage`/`seoNoindex`/`seoCanonical` override fields, a title-template option, and an admin-only door onto what `@cogenta/seo` actually computes (fiche 13).

- `@cogenta/seo`'s `buildMetaTags` now reads the conventional `seoTitle`, `seoDescription`,
  `seoImage` and `seoCanonical` fields when a collection declares them — an ordinary field a
  site's own schema adds, never a contract A change. A collection that declares none of
  them behaves exactly as it did before this change. `MetadataOptions` gains
  `titleTemplate`/`collectionTitleTemplates` (`%title% — %site%`-style composition, applied
  only to a *derived* title, never to an explicit `seoTitle` override). `isIndexable` now
  also excludes an entry whose collection declares `seoNoindex` and has it switched on, via
  the new exported `isSeoNoindexed` — this is also what keeps a noindexed page out of
  `/sitemap.xml` while it still carries `noindex` in its own `<head>`.
- `@cogenta/api` gains `createSeoRouter` (`SeoRouter`, `SeoRouterOptions`, `SeoDiagnostics`):
  `POST /api/seo/preview` computes the real head for one unsaved edit (gated by `update` on
  the named collection), and `GET /api/seo/diagnostics` is a site-wide, admin-only report —
  sitemap size and inclusion reasons per collection, `robots.txt`, and content-quality
  anomalies (missing descriptions, titles over 60 characters, duplicate titles, and the
  "published but the sitemap would be empty" class of bug this fiche is named for). Both
  routes call the exact same `buildMetaTags`/`isIndexable`/`isPublished` the public render
  path calls — neither one re-derives anything. `@cogenta/api` gains a new dependency on
  `@cogenta/seo`.
- `@cogenta/cli` mounts `/api/seo` in `cogenta serve`, next to `/api/redirects` and
  `/api/search`.

All additions are additive and backward compatible: a collection that declares none of the
conventional SEO fields, and a caller that never sends `titleTemplate`, see no behaviour
change.
