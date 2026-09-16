---
'@cogenta/starters': minor
'create-cogenta': minor
---

The showcase blueprint is now an engineering company, written in French and in English

`vitrine` presents a fictional company that designs sensors, a monitoring
platform and field services for electricity, water and rail networks. It seeds
six solutions, four case studies filed by sector, three testimonials, four job
openings, four articles (schedulable, so they appear in the editorial calendar)
and ten pages, including legal notice, privacy policy and photo credits.

The copy exists in French and in English and follows the site's default
locale, addresses included (`/references/…` in French, `/case-studies/…` in
English): `@cogenta/starters` gains `contentPackFor(id, locale)`, which
`create-cogenta` now uses when it scaffolds and when it resets a playground.

Every photograph is a real one from Wikimedia Commons under CC0, the public
domain or a Creative Commons Attribution licence, credited on the site's own
credits page; the previous generated images are removed. Client logos and the
product screenshots are drawn for the blueprint.

Breaking for code importing the blueprint's internals: the `VITRINE_*`
constants and the `service` collection are replaced by `vitrineSchema(copy)`,
`buildVitrineDemoPages(copy, context)`, `vitrineMenus`, `vitrineWidgets`,
`vitrineSiteSettings`, `vitrineMediaSpecs` and `createVitrineContentPack`.
