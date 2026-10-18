---
'@cogenta/starters': minor
---

The `documentation` blueprint is now written in French as well as English.

A site whose default locale is French (`fr`, `fr-FR`, ...) is seeded with the French
documentation: thirteen pages with French headings, sections and slugs
(`/docs/demarrage-rapide`, `/docs/verifier-les-signatures`, ...), a French home page,
menus, footer, widgets and site settings. Commands, configuration keys, API names and
terminal output stay in English, as in the French documentation of any developer tool;
the comments inside code examples are translated. French typography is applied to the
prose (narrow no-break spaces before `; ? ! %`, a no-break space before `:`, « guillemets »).
`contentPackFor('documentation', locale)` picks the language; `documentationContentPack`
remains the English pack. The delivery-flow diagram is redrawn in two language variants
(`delivery-flow-fr.png`, `delivery-flow-en.png`, no gradient, readable at phone width);
the blueprint still bundles no photograph. New exports: `createDocumentationContentPack`,
`documentationCopyFor`, `documentationMediaSpecs`. The `summary` field of `doc_page` no
longer carries an English `admin.label`, so the admin shows its translated name.
