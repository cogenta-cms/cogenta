# @cogenta/starters

## 0.1.4

### Patch Changes

- Updated dependencies [`aef3a40`]:
  - @cogenta/schema@0.7.0
  - @cogenta/api@2.7.0
  - @cogenta/blocks@1.1.2
  - @cogenta/widgets@0.2.2
  - @cogenta/render@0.3.4

## 0.1.3

### Patch Changes

- Updated dependencies [`082a630`, `43d82cf`, `130d762`, `3872f56`]:
  - @cogenta/schema@0.6.0
  - @cogenta/api@2.6.0
  - @cogenta/blocks@1.1.1
  - @cogenta/widgets@0.2.1
  - @cogenta/render@0.3.3

## 0.1.2

### Patch Changes

- Updated dependencies [`6a2b8c4`, `6fc014e`]:
  - @cogenta/blocks@1.1.0
  - @cogenta/widgets@0.2.0
  - @cogenta/api@2.5.2
  - @cogenta/render@0.3.2

## 0.1.1

### Patch Changes

- Updated dependencies [`f3bc81f`, `614f545`]:
  - @cogenta/api@2.5.1
  - @cogenta/core@0.11.0
  - @cogenta/blocks@1.0.6
  - @cogenta/render@0.3.1
  - @cogenta/schema@0.5.4
  - @cogenta/widgets@0.1.1

## 0.1.0

### Minor Changes

- Widgets in the sample data (L30). A blueprint content pack can declare `widgets` (`BlueprintWidget`, seeded by `seedBlueprintWidgets` through the real widget store), and the magazine blueprint places a rail (search, latest stories, sections, the membership pitch) beside its stories, section fronts and search results, with related stories under each article. `npm create cogenta` seeds them with the menus; importing a theme's sample data from the admin fills empty widget areas and keeps an area the site already fills (`widgets` in the preview, warning `widgets-kept`), and a reset counts the widgets it deletes. `cogenta serve` now draws the sidebar beside the content of every reading page (an article, an archive, search results, a form) in one markup, `cg-sidebar-layout`, with the entry's comments in the same column; the home page and a page opening on its own hero keep their full width.

- [`ae9338b`](https://github.com/cogenta-cms/cogenta/commit/ae9338b6e95bdbe5d39d8a3db6a954060f9f1546) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package: the starter content packs `create-cogenta` seeds, now importable
  by other tools. It carries, per site type, the collections and taxonomies, the
  demo entries, the menus, the site settings, the starting skin and the demo
  media (bundled photographs and the procedural `demo-art` renderer), through
  `BLUEPRINT_CONTENT_PACKS`, `seedDemoMedia`, `seedBlueprintMenus`,
  `seedSiteSettings` and `STARTING_SKINS`. Nothing about the content itself
  changes: this is the code `create-cogenta` has always run, moved so that
  `@cogenta/cli` can apply a theme's sample data without depending on the
  installer.

### Patch Changes

- `@cogenta/theme-association` sets widget areas (`theme@1.6`) in its own register. It exports `widgetAreas` (`sidebar`, `content-after`), places footer widget columns on its green band under the menu and above the legal line, and ships `styles/widgets.css`. That sheet sets the shared sidebar layout as a noticeboard side column: every widget opens on the heavy ink rule the calendar uses, lists sit between hairlines with square photographs, and an ask sits on the paper band with the green button. The yellow stays reserved for the header's donation ask. Beside the side column, an event keeps its date and details and a programme keeps its portrait. A footer with no widgets renders byte for byte as before. Rules that read a direct child of `<main>` also match inside the layout's content column. Search results now set titles in the display face and summaries in the text face, and the search field and its button share one height.
  
  The `association` blueprint seeds its side column. An event page shows the four weekly programmes and a call to volunteer. A programme page shows the ask to keep it free and the advice sessions at the hall. Search results show the ask and the programmes. The home page and site pages keep their full width.

- The blog theme now sets widget areas in its own register (contract D `theme@1.6`): it declares `widgetAreas`, so footer widget columns sit inside its colophon between the navigation and the legal line, and a new `widgets.css` puts the host's sidebar layout on the theme's twelve-column grid. On a wide screen the content keeps nine columns, so the margin and the text line stay exactly where they are on every other page, and the sidebar takes the last three; below that width the sidebar follows the content in as many columns as fit. Widgets use the theme's own type (small-capital labels on an ink rule, titles in the text face, hairlines between rows, fields drawn as baselines), and related entries after an essay are set like the index, with the date in the margin. The `blog` blueprint now seeds a sidebar (about, search, recent posts, subjects with counts, tags, posts by year) on posts, subject and tag archives, date archives and search results, plus a "Further reading" list under each post.

- The documentation theme now declares its widget areas and sets them in its own register. On a documentation page the sidebar becomes the right-hand rail it shares with "On this page": the contents stay in view while the page is read and the widgets sit at the foot of the rail, level with the end of the article, so the docs grid never gains a fourth column; a page with no contents gives the rail to the widgets, between 64rem and 80rem they close the article's column, and on a phone they follow the page. Beside search results and archives the same rail sits at the page's right edge. Footer widget columns are placed inside the theme's footer, above the legal line, and search result summaries take the theme's muted ink in dark mode. The documentation blueprint seeds a "Need help?" list and the 2.4 upgrade note on doc pages, and a "Popular pages" list beside search results.

- The shop theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its stone footer as a tier under a hairline, each column starting on a column of the row above, and styles the host's `cg-sidebar-layout` the way a product sheet sets its details: a caption label, ruled rows of words, a product's photograph at 4:5 on the plate, a call to action as the theme's arrow link and a search button as underlined words, so the one filled ink rectangle stays with the page's own action. Beside the column a page title stacks over its lead, running text and questions take the column at the reading measure, goods go three across and a product's photograph and sheet share the column; on a phone and a tablet the column follows the page. A strip of entries with photographs before or after the content lines up with the goods grid. Host-rendered page titles keep their style inside the content column, and search excerpts and counts follow the dark palette. The store blueprint seeds a customer care list and a contact prompt beside the ordering, delivery, repairs, contact and terms pages, the newest pieces beside search results, and in the footer the shop's telephone and the letters from the workshop, each hidden where the page already says the same; the contact page now names the letters' address.

- The entreprise theme now declares its widget areas (`theme@1.6`) and sets them in its own register: beside a case study, a practice, a sector archive or search results, the side column sits on the page's own gutters with each widget opening on an ink rule and a small-capitals label, work titles in the display serif, counts in tabular figures, and the call to discuss a mandate as the theme's one dark plane; under the text, selected work reads as an exhibit of three. The reading column keeps its hanging headings on a wide screen and stacks them above the text when narrower, the sidebar stacks under the content on mobile, footer widget columns are placed inside the theme's own footer, and rules that read a direct child of `<main>` still apply inside the sidebar layout. The search results page also gets its excerpts in the text face and a dark-aware result count. The `vitrine` blueprint seeds the widgets such a firm would have: sectors with counts, other case studies and the mandate call beside a case study, the other practices and a partner's contact details beside a practice with selected work under it, and a search box and sectors on a sector archive, never on the home page or the site's own pages.

- The portfolio theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, opens its footer on a tier of widget columns right under the footer's hairline, on the footer's twelve columns (one column alone is set like the theme's contact block, a call to action's heading at the size of the contact line), and styles the host's `cg-sidebar-layout` on the page's own grid: the content on the first eight columns, the widgets on the last three, the columns the header's navigation and the footer's profiles already stand on. Every widget opens like a block of the theme, a hairline in ink and a small sentence-case label; lists are ruled rows like the index of work, the page being read underlined in the signal; work in a widget keeps its 3:2 cover, and before or after the content it is a row of covers across the grid that becomes a scrolling strip on a phone; a call to action is the theme's arrow link, never a second filled rectangle; headings and quotations stay in Archivo instead of the host floor's serif. Inside the content column a project, an archive, running text and the work grid keep their proportions on eight columns, and the first section keeps its opening space. The host-rendered search page is now set in the theme's register on the page's edges: its title at the size of an archive title with the count under it, the form as a baseline field, the results as ruled rows with the date under the title and the statement beside it. The portfolio blueprint seeds the widgets: after a project, the three projects that share the most with it at their covers; beside the index of a discipline, a client or a member of the team, the other terms of that taxonomy, and the disciplines beside search results; in the footer, the studio's invitation to new work on every page that does not already end on one. No column is placed beside a project.

- The restaurant theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its charcoal footer as a second tier under a hairline, each column starting on a column of the band above, and styles the host's `cg-sidebar-layout` as the margin of a printed menu card beside a dish, a page that opens on its title and search results. Each group opens on the menu's own section label (the display serif in small capitals, in brass, over an ink rule); a call to action is the theme's filled rectangle beside a dish and underlined words on the footer band; opening hours are a ruled two-column list; a quotation is set in the light serif. Inside the content column a dish keeps its photograph and its words side by side and running text keeps its measure; on a phone the column stacks under the content on the page's own gutters. The host-rendered page title and a closing band keep their styles inside the content column, and search result excerpts now follow the evening palette instead of the skin's daytime grey. The restaurant blueprint seeds the widgets: the way to book and a critic's line beside every dish (the booking call also beside search results), and in the footer what the address card leaves out (closing days, the counter, telephone hours) and the room upstairs, each hidden on the pages that already say the same.

- The saas theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its footer on the same twelve columns, and styles the host's `cg-sidebar-layout` as a quiet side column beside changelog entries, feature pages, archives and search results, parted from the content by a hairline, with small semibold labels, dates and counts in Geist Mono, the column search as a hairline control and the call to action as the theme's one primary button; on a phone the column stacks under the content on the page's own gutters. Blocks inside the content column keep the page edges and a full reading measure, and the search page title keeps its style there. The saas blueprint seeds that column: a search box, the changelog by month, recently shipped releases, resource links and a demo call to action, each shown only where the page does not already list the same thing.
- Updated dependencies [`ffbfcc3`, `166b71e`, [`7711371`](https://github.com/cogenta-cms/cogenta/commit/77113713a5be32d462995565474b0fa546653147), `dc78c2c`, [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`78989f1`](https://github.com/cogenta-cms/cogenta/commit/78989f11702f3c4e9dfdd0328fc50099fceabd64), [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/api@2.5.0
  - @cogenta/core@0.10.0
  - @cogenta/widgets@0.1.0
  - @cogenta/render@0.3.0
  - @cogenta/blocks@1.0.5
  - @cogenta/schema@0.5.3
