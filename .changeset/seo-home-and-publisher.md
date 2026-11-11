---
"@cogenta/seo": minor
"@cogenta/cli": patch
---

SEO fixes found on a live site:

- The home page's canonical, `og:url`, `hreflang` and sitemap entry named `/home` (and `/fr/home`), which the server redirects to `/`: crawlers were sent to a redirect. They now name `/` and `/<locale>/` (`SeoSite.homePath`).
- An article's JSON-LD names its publisher with the site's logo, the page it is the main subject of, its section, and credits the organisation when the article has no author. The home page also describes the site as a `WebSite` with its search action.
- `og:locale` is written as Open Graph spells it (`en_US`, `fr_FR`), not as a bare language (`openGraphLocale`).
- Taxonomy archives get a `description` (the intro, or the archive's name and newest headlines), Open Graph tags and a `CollectionPage` JSON-LD.
