---
"@cogenta/starters": minor
"create-cogenta": minor
"@cogenta/cli": minor
"@cogenta/api": minor
"@cogenta/widgets": patch
---

Widgets in the sample data (L30). A blueprint content pack can declare `widgets` (`BlueprintWidget`, seeded by `seedBlueprintWidgets` through the real widget store), and the magazine blueprint places a rail (search, latest stories, sections, the membership pitch) beside its stories, section fronts and search results, with related stories under each article. `npm create cogenta` seeds them with the menus; importing a theme's sample data from the admin fills empty widget areas and keeps an area the site already fills (`widgets` in the preview, warning `widgets-kept`), and a reset counts the widgets it deletes. `cogenta serve` now draws the sidebar beside the content of every reading page (an article, an archive, search results, a form) in one markup, `cg-sidebar-layout`, with the entry's comments in the same column; the home page and a page opening on its own hero keep their full width.
