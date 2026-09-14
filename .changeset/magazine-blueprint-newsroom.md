---
'create-cogenta': patch
---

The `magazine` blueprint now scaffolds a credible city news and culture
magazine: eighteen articles across News, Business, Culture and Opinion, dated
over three weeks, three of them long reads of more than 700 words, written as
reporting, criticism and signed columns with named sources, figures and quotes
from a fictional city.

Sections and writers are now real taxonomies (`section`, `author`), so every
section has a front page and every writer an archive, and an article page can
show its section and byline. Articles gain a `kicker` and a `frontPage` flag;
the home page is a front page of the flagged stories followed by the opinion
columns, a Culture rail, a ranked list and a Business rail, and new
`subscribe` and `standards` pages join `about`. Menus lead to the section
fronts and to real pages only.

The demo copy names the site it was created for, the footer note reads as a
publisher's line, and the starting skin now matches `@cogenta/theme-magazine`
(Fraunces, Libre Franklin, white newsprint and one editorial red). The bundled
photographs that showed invented lettering on signs, shopfronts, printed
pages and equipment are removed; nine clean photographs remain, some cropped so
nothing unreadable is left in frame, and most stories carry no picture, as in
a newspaper. The abstract logos, avatar and About page composition are gone.
