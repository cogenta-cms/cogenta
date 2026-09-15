---
"@cogenta/widgets": minor
"@cogenta/core": minor
"@cogenta/api": patch
---

New package `@cogenta/widgets` (L30): widget areas as on WordPress. It holds the widget vocabulary (content widgets such as text, image, gallery, quote, call to action, links, contact and about; dynamic widgets such as recent, related and popular entries, terms, tag cloud, archives, recent comments, search, menu, social links, form, table of contents and calendar), its validation with defaults, the standard areas every theme receives (`sidebar`, `content-before`, `content-after`, `footer-1` to `footer-4`), visibility rules (pages, audience, devices, period, languages) evaluated by one pure function, and the `cogenta_widgets` store with ordering, moves between areas, duplication and hiding. `@cogenta/core` gains `WIDGET_INVALID` and `WIDGET_NOT_FOUND`.
