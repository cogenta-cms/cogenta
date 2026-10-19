---
'@cogenta/starters': minor
---

The `portfolio` blueprint is now an independent photography studio, written in French and in English, on twenty-eight real photographs.

A site scaffolded with `defaultLocale: 'fr'` gets French content, French addresses (`/projets/…`, `/collaborateurs/…`), a Lyon address and euro prices; any other locale gets the English site, as before (`portfolioContentPack` is still the English pack, and `contentPackFor('portfolio', locale)` picks by locale). The collection and taxonomy names the project page labels its fact sheet with follow the language. French text is set with no-break spaces before `: ; ? ! » € %` and inside thousands.

The seven projects (a lagoon, a vineyard, a fishing harbour, a forest under snow, a glacier, a cliff path, a valley of stone towers) replace the drawn design work, and each is a case study of 310 to 380 words. Every photograph comes from Wikimedia Commons under CC0, the public domain or CC BY, is credited on a seeded "Photo credits" page linked from the footer, and is recorded in `portfolio-credits.ts`.

If you imported the old `PORTFOLIO_DEMO_PROJECTS`, `PORTFOLIO_DEMO_DISCIPLINES`, `PORTFOLIO_DEMO_TEAM`, `PORTFOLIO_MEDIA_SPECS`, `PORTFOLIO_MENUS`, `PORTFOLIO_WIDGETS` or `PORTFOLIO_SITE_SETTINGS` constants, or called `buildPortfolioDemoPages(options)`, read them from `portfolioCopyFor(locale)` and the new `portfolioMediaSpecs`, `portfolioMenus`, `portfolioWidgets` and `portfolioSiteSettings` functions instead; the page builders now take the copy as their first argument.
