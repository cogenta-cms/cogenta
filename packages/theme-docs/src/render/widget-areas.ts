/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * footer; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets on this theme's
 * own documentation grid.
 *
 * A documentation page already has two columns of its own beside the
 * article: the navigation on the left and "On this page" on the right. The
 * sidebar never becomes a fourth column next to them. It is the right-hand
 * rail, shared with "On this page": the contents stay in view while the page
 * is read, and the widgets sit at the foot of the rail, level with the end of
 * the article, where a reader who finished the page looks for help and for
 * what comes next. On a page without its own contents, and beside search
 * results or an archive, the widgets are the rail.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Page rail',
    description:
      'The right-hand rail: under “On this page” and level with the end of a documentation page, beside search results and archives.',
  },
  {
    id: 'content-after',
    label: 'After the page',
    description: 'In the reading column, after a page and its previous and next links.',
  },
]
