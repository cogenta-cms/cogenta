---
"@cogenta/cli": minor
"@cogenta/theme-kit": patch
"@cogenta/theme-canonical": patch
"@cogenta/theme-blog": patch
"@cogenta/theme-magazine": patch
"@cogenta/theme-portfolio": patch
"@cogenta/theme-entreprise": patch
"@cogenta/theme-ecommerce": patch
"@cogenta/theme-saas": patch
"@cogenta/theme-restaurant": patch
"@cogenta/theme-association": patch
---

Widget areas on the public site (L30). `cogenta serve` resolves the widgets of every page it renders (entries, term and date archives, search, forms), decides their visibility for the real request, reads their data through the permission-checked gateway, and either hands them to a theme that places them itself (`widgetAreas` export, contract D `theme@1.6`) or places them around the theme's output. It mounts `/api/widgets`, serves date archives at `/archive/{collection}/{year}/{month}`, follows widget dropdowns through `/_cogenta/go` (same-site paths only), includes widgets in backups and clears them on a sample-data reset. Headings of running text now carry an `id`, so a table of contents can link to them.
