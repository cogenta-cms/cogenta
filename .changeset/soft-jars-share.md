---
'@cogenta/cli': minor
---

`cogenta serve` now serves `/feed.xml` (RSS 2.0) and `/atom.xml` (Atom 1.0), and every
page advertises them from its `<head>`.

`@cogenta/seo`'s `feedItemsFor`/`renderRssFeed`/`renderAtomFeed` were written and
unit-tested in L3 and never reached a route: a Cogenta site simply had no feed, which
is parity Ghost, WordPress and Hugo all ship out of the box. Both are read the same
`ANONYMOUS` way `sitemap.xml` and `robots.txt` are, and on by default — a feed
publishes only what is already published, at URLs already in the sitemap, so there is
nothing here for an operator to consent to.

Also fixes the public admin bar (fiche 35 task 6), which had **never rendered**: its
renderer existed and the one dispatch meant to enable it never set the flag. Now that
it appears, its three labels are translated (fr/en, following the page's own language)
and its first one follows the same white-label switch as the footer credit, instead of
saying "Cogenta Admin" on every site.
