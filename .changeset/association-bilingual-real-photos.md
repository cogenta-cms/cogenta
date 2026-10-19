---
'@cogenta/starters': minor
---

Write the association blueprint in French and in English, and replace its AI-generated photographs with real, credited ones.

The charity site was English-only, so a French site got an English food bank. It now ships
two complete versions, the way `vitrine` does: `contentPackFor('association', 'fr')` returns
a French association loi 1901 (membership, general assembly, tax receipts at 66 %, a legal
notice, French addresses and a telephone number from the range reserved for fiction), and any
other locale the English charity (Gift Aid, trustees, a charity number). Collections, labels
and routes follow the language (`/nos-actions/…` and `/agenda/…` in French, `/what-we-do/…` and
`/events/…` in English), as do the demo content, the menus, the widgets, the footer and the
alternative text of every picture. French typography is applied once when the pack is built:
no-break spaces before `: ; ? !`, `%` and `€`, inside times and telephone numbers.

The eight photographs generated at L25 depicted nothing real; they are replaced with nine real
photographs from Wikimedia Commons, each under CC0, the public domain or CC BY, none showing a
person presented as a volunteer or a beneficiary (the testimonial no longer carries a portrait).
A seeded "Photo credits" page, in both languages and linked from the footer, lists the author,
licence and source of every file (`association-credits.ts`). French partner wordmarks were
drawn for the French site. The old blueprint-level exports (`ASSOCIATION_PROGRAMMES`,
`buildAssociationDemoPages(media)`, …) take a copy: use `associationCopyFor(locale)` and the
`associationSchema`, `associationMenus`, `associationWidgets` and `associationMediaSpecs`
builders; `associationContentPack` is still the English pack.
