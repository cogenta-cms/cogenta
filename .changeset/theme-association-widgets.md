---
"@cogenta/theme-association": minor
"@cogenta/starters": patch
---

`@cogenta/theme-association` sets widget areas (`theme@1.6`) in its own register. It exports `widgetAreas` (`sidebar`, `content-after`), places footer widget columns on its green band under the menu and above the legal line, and ships `styles/widgets.css`. That sheet sets the shared sidebar layout as a noticeboard side column: every widget opens on the heavy ink rule the calendar uses, lists sit between hairlines with square photographs, and an ask sits on the paper band with the green button. The yellow stays reserved for the header's donation ask. Beside the side column, an event keeps its date and details and a programme keeps its portrait. A footer with no widgets renders byte for byte as before. Rules that read a direct child of `<main>` also match inside the layout's content column. Search results now set titles in the display face and summaries in the text face, and the search field and its button share one height.

The `association` blueprint seeds its side column. An event page shows the four weekly programmes and a call to volunteer. A programme page shows the ask to keep it free and the advice sessions at the hall. Search results show the ask and the programmes. The home page and site pages keep their full width.
