---
"@cogenta/theme-kit": minor
---

Contract D `theme@1.6` (L30): widget areas. `PageContent.widgets` and `ChromeInput.widgets` carry the widget areas the host resolved for a page, as finished view models (`ResolvedWidget`: text, image, gallery, embed, quote, call to action, links, contact, about, entries, terms, tag cloud, archives, comments, search, social, form, table of contents, calendar). `renderWidgetArea` and `renderFooterWidgets` are the shared rendering every theme can use. Both fields are optional: a theme that ignores them renders as before.
