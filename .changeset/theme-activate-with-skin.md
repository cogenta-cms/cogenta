---
'@cogenta/api': minor
'@cogenta/cli': minor
---

**Choosing a theme can now bring its own look with it.** `POST /api/theme/activate`
switches the site's theme and, when `applySkin` is true, applies that theme's
own typography and colours in the same write (validated against contract D
first). The appearance screen asks before selecting a theme: use the complete
theme, or keep the site's current colours and fonts and change only the layout.
Before, selecting a theme always kept the site's skin, so a newly chosen theme
never showed the fonts and palette it was designed with.
