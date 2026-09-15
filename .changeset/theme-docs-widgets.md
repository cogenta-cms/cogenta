---
"@cogenta/theme-docs": minor
"@cogenta/starters": patch
---

The documentation theme now declares its widget areas and sets them in its own register. On a documentation page the sidebar becomes the right-hand rail it shares with "On this page": the contents stay in view while the page is read and the widgets sit at the foot of the rail, level with the end of the article, so the docs grid never gains a fourth column; a page with no contents gives the rail to the widgets, between 64rem and 80rem they close the article's column, and on a phone they follow the page. Beside search results and archives the same rail sits at the page's right edge. Footer widget columns are placed inside the theme's footer, above the legal line, and search result summaries take the theme's muted ink in dark mode. The documentation blueprint seeds a "Need help?" list and the 2.4 upgrade note on doc pages, and a "Popular pages" list beside search results.
