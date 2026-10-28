---
'@cogenta/schema': minor
'@cogenta/theme-kit': minor
'@cogenta/theme-blog': minor
'@cogenta/starters': minor
'create-cogenta': minor
'@cogenta/cli': minor
'@cogenta/api': patch
---

A site published in several languages is bilingual for real. Scaffolded with locales `fr,en` (default `fr`), every blueprint now serves its routed collections under a locale prefix: the default language at its usual addresses, the other at `/en/…`, including its own home page at `/en/`. The blog blueprint also ships its English words as translations of its French pages and essays, with their own navigation, settings and widgets. Lists on a page (`collectionList`, latest, related, popular, archives, subject counts) show the entries of the page's own language. `theme@1.10` (additive) adds `ChromeInput.languages` and `renderLanguageSwitcher` to `@cogenta/theme-kit`, and `ChromeInput.homeHref` is now the language's home (`/en/`) on a page in a language served under a prefix; the blog theme draws the switcher in its header.

`buildPath` accepts `{ defaultLocale }`, and every caller that names a public address now passes it: links, preview links, MCP and agent redirect targets, menu entries, content-webhook `path` and slug-change redirect origins all drop the default-locale prefix on a localised route (a redirect is recorded from `/blog/old`, not `/fr/blog/old`; a webhook carries `/blog/post`, not `/fr/blog/post`). Single-language sites, and collections not routed by locale, are unchanged.

A site scaffolded before this keeps its schema (ADR-0010, ADR-0023: the schema is never rewritten by a server or a bootstrap). The new operator command `cogenta schema localize-routes` (dry run unless `--write`) brings `cogenta.schema.mjs` to the same routing and prints the 301 redirects the move needs; run it on a development copy, commit the file, deploy it. Other themes do not draw the switcher yet.
