---
'@cogenta/cli': patch
---

Category, tag and author archive pages now carry the same site chrome as every
other page: the tagline, the footer note and the social links set in the
admin. They were never passed to the theme there, so an archive's header and
footer were missing them.

An article whose body is made of prose blocks, rather than one rich text
field, now shows its reading time in the entry header too: it was only ever
counted from a rich text field, so most article pages never had one.
