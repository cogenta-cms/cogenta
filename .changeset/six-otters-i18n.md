---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': patch
---

Add `GET /{collection}/{id}/translations`, listing every live entry of the
translation family an id belongs to (ADR-0014: one entry per language,
linked by `translationOf`) — itself included, gated the same way `history`
already is (only an actor who may read this entry's working state may
enumerate its family).

`buildSchemaDocument` accepts an optional second `site` argument
(`{locales, defaultLocale}`), included in the document only when given —
`.cogenta/schema.json`'s own build-time call is unaffected. `cogenta serve`
now passes it through to `/api/schema`, so the admin can render a locale
switcher without hardcoding assumptions about which locales a site has.

Fixed along the way: `cogenta serve` was hardcoding `locales: ['en']`,
`defaultLocale: 'en'` into the content service's routing options instead of
reading `config.site.locales`/`defaultLocale` — a site configured for more
than English silently only ever routed English. `translationOf` on create
was already fully wired end to end (REST body → `ContentStore.create`); no
change was needed there.
