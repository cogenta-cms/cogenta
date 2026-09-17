---
'@cogenta/theme-kit': minor
'@cogenta/cli': minor
'@cogenta/theme-canonical': patch
'@cogenta/theme-association': patch
'@cogenta/theme-blog': patch
'@cogenta/theme-docs': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
'@cogenta/theme-restaurant': patch
'@cogenta/theme-saas': patch
---

Author archives: a byline now leads to its author's page

`cogenta serve` answers `/archive/author/{slug}` with what an author published, their bio
and portrait on top, through the same archive rendering as term and date archives. Only an
account with a public name and at least one published dated entry has one; any other slug
is a 404, so the addresses never list a site's accounts. Author archives are in the sitemap.

Contract D `theme@1.8`, additive: `PageEntryAuthor.href` and `TermArchiveInput.intro`, with
`authorNode` and `renderArchiveIntro` in `@cogenta/theme-kit`. Every theme links its byline
and shows the intro; a theme that ignores both renders exactly as before.
