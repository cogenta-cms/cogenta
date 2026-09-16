# @cogenta/widgets

## 0.1.1

### Patch Changes

- Updated dependencies [`614f545`]:
  - @cogenta/core@0.11.0
  - @cogenta/blocks@1.0.6
  - @cogenta/schema@0.5.4

## 0.1.0

### Minor Changes

- New package `@cogenta/widgets` (L30): widget areas as on WordPress. It holds the widget vocabulary (content widgets such as text, image, gallery, quote, call to action, links, contact and about; dynamic widgets such as recent, related and popular entries, terms, tag cloud, archives, recent comments, search, menu, social links, form, table of contents and calendar), its validation with defaults, the standard areas every theme receives (`sidebar`, `content-before`, `content-after`, `footer-1` to `footer-4`), visibility rules (pages, audience, devices, period, languages) evaluated by one pure function, and the `cogenta_widgets` store with ordering, moves between areas, duplication and hiding. `@cogenta/core` gains `WIDGET_INVALID` and `WIDGET_NOT_FOUND`.

### Patch Changes

- Widgets in the sample data (L30). A blueprint content pack can declare `widgets` (`BlueprintWidget`, seeded by `seedBlueprintWidgets` through the real widget store), and the magazine blueprint places a rail (search, latest stories, sections, the membership pitch) beside its stories, section fronts and search results, with related stories under each article. `npm create cogenta` seeds them with the menus; importing a theme's sample data from the admin fills empty widget areas and keeps an area the site already fills (`widgets` in the preview, warning `widgets-kept`), and a reset counts the widgets it deletes. `cogenta serve` now draws the sidebar beside the content of every reading page (an article, an archive, search results, a form) in one markup, `cg-sidebar-layout`, with the entry's comments in the same column; the home page and a page opening on its own hero keep their full width.
- Updated dependencies [`166b71e`, [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/core@0.10.0
  - @cogenta/blocks@1.0.5
  - @cogenta/schema@0.5.3
