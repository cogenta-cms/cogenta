---
"@cogenta/cli": patch
---

Fix date archives on sites with more than 100 entries. The archives widget and the `/archive/{collection}/{year}` page asked the gateway for the next page under `cursor`, which it ignores (it reads `after`), so every page was the first one again: the widget counted up to its 1000 scan cap and the archive page listed each entry several times.
