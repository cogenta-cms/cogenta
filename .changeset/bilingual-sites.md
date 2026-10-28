---
'@cogenta/schema': minor
'@cogenta/theme-kit': minor
'@cogenta/theme-blog': minor
'@cogenta/starters': minor
'create-cogenta': minor
'@cogenta/cli': minor
---

A site published in several languages is bilingual for real. Scaffolded with locales `fr,en` (default `fr`), every blueprint now serves its routed collections under a locale prefix: the default language at its usual addresses, the other at `/en/…`, including its own home page at `/en/`. The blog blueprint also ships its English words as translations of its French pages and essays, with their own navigation, settings and widgets. Lists on a page (`collectionList`, latest, related, popular, archives, subject counts) show the entries of the page's own language. `theme@1.10` (additive) adds `ChromeInput.languages` and `renderLanguageSwitcher` to `@cogenta/theme-kit`; the blog theme draws the switcher in its header, linking the translation of the page being read or the home page of the other language. `buildPath` accepts `{ defaultLocale }` so links, redirects and webhook payloads name the unprefixed default-language address; `create-cogenta` exports `localizeSchemaFile`, which the container's bootstrap runs on later boots to bring the `cogenta.schema.mjs` of an already scaffolded multilingual site to the same routing (idempotent, original kept as `cogenta.schema.mjs.before-locale-routing`). Other themes do not draw the switcher yet.
