---
'@cogenta/starters': minor
---

Write the `saas` blueprint in French as well as English, with real photographs and drawn interface screenshots in both languages.

A French site (`fr`, `fr-FR`, `fr-CA`, ...) now scaffolds a site written in French rather than a
translated one: the collections are routed `/fonctionnalites/…` and `/nouveautes/…`, the pages are
`produit`, `tarifs`, `securite`, `entreprise`, `mentions-legales` and the rest, prices are in euros,
the company is based in Paris with an office in Montreal, the ERPs are the ones a French buyer
runs (Sage X3, Cegid), and the legal notice and privacy policy follow French law (RGPD, CNIL).
`contentPackFor('saas', locale)` picks the language, the way `vitrine` does; the English
`saasContentPack` export and every English export of `saas.ts` stay as they were. The new
`createSaasContentPack(locale)`, `saasCopyFor`, `saasSchema`, `saasMenus`, `saasFooter`,
`saasWidgets`, `saasSiteSettings` and `saasMediaSpecs` expose each part for one language.

The product screenshots (the approvals queue, the policy editor, the audit log, the ERP
connection, sign-in and provisioning, the time-to-approve report, the API settings) are drawn as HTML
and rendered to PNG in English and in French, with invented data and no gradient
(`scripts/saas-assets/`); the French customers' wordmarks are drawn the same way. The portrait of
the quoted customer is gone: a fictional person gets no photograph. Three real photographs per
language (a data-centre room, and the two cities where the company has offices) come from
Wikimedia Commons under CC0 or CC BY, and a seeded "Photo credits" page, linked from the footer,
lists their author, licence and source.

The `feature` and `changelog` fields no longer carry an English `admin.label`, so the administration
labels them through its own dictionaries. The screenshot files are renamed `<name>-en.png` and
`<name>-fr.png`.
