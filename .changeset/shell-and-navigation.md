---
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 35 (coquille et navigation): the admin sidebar is now grouped by
domain (Contenu, Apparence, Boutique, IA, Comptes, Exploitation,
Réglages) and filtered by role, active features (a shop-less site has
no Boutique group) and available capabilities (no AI provider reduces
the IA group to its explanation page) — a contributor sees six entries
instead of twenty-three. Adds a collapsible/responsive sidebar with a
mobile drawer, aggregated badges (trash count, orders to process) from
one request rather than one per badge, a breadcrumb with a
per-navigation `document.title`, and `⌘K`/`Ctrl+K` command-palette
actions on top of the existing search. `@cogenta/api` gains
`createShellStatusRouter` (the single aggregated status read the
badges and feature gates use). `@cogenta/cli`'s `theme-render.ts`
renders a thin "edit this page" admin bar on the public site for an
authenticated visitor only, never for an anonymous one.
