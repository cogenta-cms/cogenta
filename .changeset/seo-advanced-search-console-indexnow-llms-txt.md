---
'@cogenta/seo': minor
'@cogenta/api': minor
'@cogenta/schema': minor
'@cogenta/cli': minor
---

Fiche 50, tasks 1-5 — direct sitemap/robots.txt links from the Diagnostic tab, Search Console/Bing site verification (meta tag only, no OAuth — R1/R7), a hand-written robots.txt addendum, and wiring the two indexing extras (`indexnow.ts`/`llms-txt.ts`) that were written and unit-tested since L3/L9 but never reachable from any route or setting. Task 6 (RSS/Atom) is explicitly out of scope, per the fiche's own "à confirmer".

- **`@cogenta/seo`**: `RobotsOptions` gains `customRules` — an admin's own robots.txt lines, merged in verbatim by `renderRobotsTxt` after the derived group(s) and before the `Sitemap:` directive. New export `robotsRuleDisallowsEverything(text)` — true when `text` contains a bare `Disallow: /`, so a caller (the admin's custom-rules editor, in particular) can confirm before saving a rule that would block every crawler.
- **`@cogenta/schema`**: `SITE_SETTINGS_REGISTRY`'s `seo` group gains six settings — `seo.googleSiteVerification`/`seo.bingSiteVerification` (meta-tag verification tokens), `seo.robotsCustomRules` (free text, merged into `/robots.txt`), `seo.indexNowEnabled`/`seo.indexNowKey` (off by default), `seo.llmsTxtEnabled` (off by default). All admin-only, all in the existing `SiteSettingsStore` — no new table.
- **`@cogenta/api`**: `SeoRouterOptions` gains `robotsCustomRules` (an async getter, same "read live" contract as `titleDefaults`) — the Diagnostics screen's `robots.content` preview now shows the exact document `/robots.txt` serves, custom rules included, and `disallowsEverything` also flags a custom rule that blocks every crawler.
- **`@cogenta/cli`**: `seo.ts`'s `SeoRenderDefaults` gains `googleSiteVerification`/`bingSiteVerification`/`robotsCustomRules`; new export `siteVerificationMetaTags` renders the two `<meta>` tags. New export `SeoOperationalSettings`/`readSeoOperationalSettings` for the two off-by-default extras. `RobotsRenderOptions`/`renderRobots` gain `customRules`. `PageChromeOptions` (`theme-render.ts`) gains `seo`, so `/search` and `/forms/{name}` carry the same verification tags every entry page does. `cogenta serve` gains `GET /llms.txt` (404 unless `seo.llmsTxtEnabled`) and IndexNow's ownership-proof key file at `/<key>.txt` (served only when the requested key matches the configured one), and pings IndexNow on a successful publish/unpublish response when `seo.indexNowEnabled` is on — never blocks or fails the response it follows.

Admin (`@cogenta/admin`, private, no changeset): the SEO screen's Général tab gains a search-engine-verification card and an IndexNow/llms.txt card (with a "Generate a key" button); the Diagnostic tab gains "Open sitemap.xml"/"Open robots.txt" links and an editable robots.txt custom-rules field that asks for confirmation before saving a rule containing `Disallow: /`.
