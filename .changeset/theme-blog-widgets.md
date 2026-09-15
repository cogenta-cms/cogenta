---
"@cogenta/theme-blog": minor
"@cogenta/starters": patch
---

The blog theme now sets widget areas in its own register (contract D `theme@1.6`): it declares `widgetAreas`, so footer widget columns sit inside its colophon between the navigation and the legal line, and a new `widgets.css` puts the host's sidebar layout on the theme's twelve-column grid. On a wide screen the content keeps nine columns, so the margin and the text line stay exactly where they are on every other page, and the sidebar takes the last three; below that width the sidebar follows the content in as many columns as fit. Widgets use the theme's own type (small-capital labels on an ink rule, titles in the text face, hairlines between rows, fields drawn as baselines), and related entries after an essay are set like the index, with the date in the margin. The `blog` blueprint now seeds a sidebar (about, search, recent posts, subjects with counts, tags, posts by year) on posts, subject and tag archives, date archives and search results, plus a "Further reading" list under each post.
