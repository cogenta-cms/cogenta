---
'@cogenta/starters': minor
---

The `blog` blueprint now ships in French as well as English. A site scaffolded with a French locale gets essays, letters, pages, menus, widgets, settings, photo alt text and the photo-credits page written in French (set in Toulouse and Montauban rather than translated from Leeds and York), with French typography, French public paths (`/categorie/…`, `/etiquette/…`, `/a-propos`, `/credits-photo`) and French term labels. `contentPackFor('blog', locale)` picks the language, `createBlogContentPack(locale)` and `blogCopyFor` are new, and the existing English exports are unchanged.
