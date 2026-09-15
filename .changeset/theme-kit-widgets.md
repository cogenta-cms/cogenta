---
"@cogenta/theme-kit": minor
---

Contract D `theme@1.6` (L30): widget areas. `ChromeInput.widgets` carries the footer columns to a theme that declares `widgetAreas`, and `PageContent.widgets` the areas a theme adds of its own, as finished view models (`ResolvedWidget`: text, image, gallery, embed, quote, call to action, links, contact, about, entries, terms, tag cloud, archives, comments, search, social, form, table of contents, calendar). `renderWidgetArea` and `renderFooterWidgets` are the shared rendering every theme can use. The standard page areas are placed by the host in one markup every theme styles (`cg-sidebar-layout`: the sidebar beside the content of a reading page, bands elsewhere). Both fields are optional: a theme that ignores them renders as before.
