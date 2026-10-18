---
'@cogenta/theme-saas': patch
---

Set a French quotation in guillemets, and keep the site's name whole in the phone header.

A quotation on a page in French was opened with an English curly quote and closed with whatever the
browser defaulted to for the language, so the two marks did not match. `:lang(fr)` now sets
« guillemets » with a thin space inside them on `quote` and `testimonial`, hung into the margin on a
wide screen and set flush on a phone, where the margin is too narrow for it.

On a 390 px screen the header's action ("Réserver une démo") left the site's name only a few pixels
and cut it to "Ledge…". Below 30rem the action now takes less padding, a smaller size and no line
break, so the name shows in full; a long name still truncates with an ellipsis.
