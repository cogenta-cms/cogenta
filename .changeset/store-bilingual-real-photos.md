---
'@cogenta/starters': minor
---

Write the `store` blueprint in French and in English, with real, credited photographs.

`contentPackFor('store', locale)` now returns the French shop for any `fr*` locale, as it
already does for `vitrine`: the product and category routes (`/boutique/…`,
`/categorie/…`), the names the administration shows, the menus, the widgets, the
settings and every word of demo content are written in French, not translated at
render time. The French is set with French typography (no-break spaces before `:` `;`
`?` and before a unit, apostrophes and thousands separators as a French reader expects),
and the shop's address, telephone number, VAT rate, withdrawal period, legal guarantee
and mediation notice follow French consumer law. `storeContentPack` stays the English
pack, so nothing that imports it changes; `storeCopyFor`, `storeSchema`, `storeMenus`,
`storeWidgets`, `storeSiteSettings`, `storeMediaSpecs` and `createStoreContentPack` are
new exports.

The shop is now a small one in Lyon, and the catalogue was rewritten around the
photographs that honestly exist: a cast-iron skillet, an enamel mug, a stovetop coffee
maker, a copper jam pan, a stoneware vase, a turned wooden bowl, Aleppo soap, a
crocheted throw, a travel bag, a wallet, boots and a sweater, in three departments
(kitchen, homeware, wear and carry). Fourteen real photographs from Wikimedia Commons
(CC0, public domain or CC BY, never ShareAlike or NonCommercial) replace the
AI-generated ones, with no brand, logo or recognisable person in any of them. A seeded
"Photo credits" page (`store-credits.ts`, linked from the footer, in both languages)
lists the title, author, licence and source of every file.

Breaking for a caller that read the old English constants: the products are now typed
`StoreProductCopy`, the third department is "Wear and carry", and the product's
`category` select holds the department's name in the site's language.
