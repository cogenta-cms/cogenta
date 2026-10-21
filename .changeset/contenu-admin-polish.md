---
"@cogenta/schema": patch
"@cogenta/api": patch
"@cogenta/seo": patch
---

Content screens polish (2026-10-21).

- `@cogenta/seo`: an empty title template is no longer applied (it produced an empty title for every entry), and a page titled exactly like the site is not repeated as "Acme — Acme".
- `@cogenta/api`: the SEO diagnostics name entries by their title and path (`EntryRef`, additive); the link-suggestion report carries `entryTitles`.
- `@cogenta/schema`: the version diff no longer reports a rich-text body as changed when only its generated `_key`s differ; a search-and-replace hit inside a block carries the block's type (`blockType`, additive) so a preview can say "Block 2 · Text".
