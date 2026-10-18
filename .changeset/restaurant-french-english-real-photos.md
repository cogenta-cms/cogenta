---
'@cogenta/starters': minor
---

Write the `restaurant` blueprint in French and in English, with real, credited photographs.

A French site used to get an English restaurant: the menu, the pages, the menus and the
footer all in English, the sections of the menu stored as `Starters` and `Mains`. The
blueprint now ships both languages, written rather than translated, the way `vitrine`
does. `contentPackFor('restaurant', 'fr-FR')` returns the French pack (`createRestaurantContentPack(locale)`),
and every other locale the English one, which `restaurantContentPack` still exports
unchanged. A French site gets French addresses (`/carte/…`, `/salon-prive`,
`/mentions-legales`), a menu filed under `Entrées`, `Plats`, `Fromages et desserts` and
`Vins au verre`, the telephone as `04 78 28 16 42`, hours as `12 h à 13 h 45`, prices as
`12 €`, and French typography: a non-breaking space inside a time, before a currency sign
and before `:` `;` `?` `!`, so a line never breaks inside `13 h 45`. The copy lives in
`restaurant-copy.ts` (types), `restaurant-copy-fr.ts` and `restaurant-copy-en.ts`; a
missing sentence in one language is a type error, not a blank on a page.

The fiction moved with the photograph of its dining room: the restaurant now occupies the
former offices of a silk merchant in rue Burdeau, in a room of green panelling and
bookcases, and the menu follows the photographs (cod in a vin jaune sauce, duck leg
confit, wild mushroom risotto, pike quenelle, apple and pink praline cake) instead of the
other way round. The menu keeps its nineteen dishes and wines.

The nine AI-generated photographs `photo-assets.ts` bundled at L25 are replaced by
thirteen real ones from Wikimedia Commons under CC0, the public domain or Creative
Commons Attribution: the room, ten dishes cropped to the theme's 4:5, the street and a
market stall. A seeded "Photo credits" page (`restaurant-credits.ts`, linked from the
footer and the legal notice, in both languages) lists the author, licence and source of
each. The field labels the blueprint used to declare in English (`admin.label`) are
removed: the administration translates them from its own dictionaries.
