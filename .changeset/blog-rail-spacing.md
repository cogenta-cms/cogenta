---
'@cogenta/theme-blog': patch
---

Fix a real layout bug in the rail form: a dead run of the page under a short lead.

`.cg-rail`'s lead and column shared one CSS Grid row, so the row was always exactly as
tall as whichever side had more to show — `align-items` cannot shrink a grid track,
only reposition a shorter item within it, so a lead with no picture and a short excerpt
left a blank column-height of empty page under it whenever the column beside it ran
longer. Two changes: the rail now lays its two columns out with flex (independent
heights, not a shared track) using the same `--cg-col`/`--cg-col-gap` tokens the page's
own subgrid is built from, so the columns still land on the exact same lines; and the
column's own items drop their standfirst (a headline and a date, the way a rail of
links reads elsewhere on this theme), which was the larger source of the height
mismatch to begin with.
