---
"@cogenta/cli": patch
---

Fixes a real bug found while verifying the `saas` blueprint (L25): a routed
entry page's `<title>`/`<h1>` fell back to the entry's raw id whenever its
collection named its title field anything other than `title` — `vitrine`'s
`service`, `restaurant`'s `menu_item`, `store`'s `product` and `saas`'s
`feature` all use `name`. `theme-render.ts`'s own `entryTitle` now follows
the same `title`/`name`/`label` fallback chain `@cogenta/theme-kit`'s
`entryTitle` already used for cards and lists, so a feature page reads
"Workflow automation" instead of a UUID.
