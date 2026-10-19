---
'@cogenta/starters': minor
---

Write the `magazine` blueprint in French as well as English, and replace its AI-generated photographs with real, credited ones.

`contentPackFor('magazine', locale)` now returns a French magazine for any `fr*` locale: *Le Courrier du Port* (or whatever name the person gave) covering Belmarais, a fictional mid-sized city, with eighteen articles in four rubriques, twelve bylined writers, a front page, an « À propos » page, subscription plans in euros, a charter and corrections page, and widgets, menus and settings in French — French typography included (no-break spaces before `: ; ? !` and inside times and amounts, « guillemets », no « de Le » when the site's name starts with an article). The English magazine is unchanged apart from its photographs, and `magazineContentPack`, `buildMagazineDemoPages` and the other existing exports keep working and still return the English one. The schema, the routes and the slugs of the collections are the same in both languages; the new `createMagazineContentPack(locale)` and `magazineCopyFor(locale)` pick the words.

The twelve photographs under `assets/photos/magazine/` are real, from Wikimedia Commons under CC0, the public domain or CC BY (author, licence and source page in `magazine-credits.ts`, also rendered on a seeded « Crédits photographiques » / "Photo credits" page linked from the footer). Each article's lead credit now names its real photographer instead of a fictional one. The `excerpt` and `frontPage` fields no longer carry an English `admin.label`: the administration names them in the reader's language.
