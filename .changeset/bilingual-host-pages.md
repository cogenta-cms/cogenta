---
'@cogenta/cli': patch
---

On a site with several languages, the pages the host draws itself follow the language of the address. `/en/search` is served (the search widget of an English page posts to it and the results are the English entries); the taxonomy archives exist per language (`/en/categorie/ia` lists the English entries with the English labels, links its hreflang pair, and the chips and the topics widget of an English page lead to it; the sitemap lists both); an unknown `/en/…` address is answered by the English 404 page with `lang="en"`; the archive no longer prints the taxonomy's machine name over its title. A page reached by anything but its one address now answers a permanent redirect to it, query string kept: `/en` to `/en/`, `/fr/…` (the default language) to the unprefixed address, `/home` and `/en/home` to the language's front door, and a trailing slash to none.
