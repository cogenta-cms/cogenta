/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * stone footer, on the footer's twelve columns; the page areas are placed by
 * the host in the shared `cg-sidebar-layout` markup, which
 * `styles/widgets.css` sets as the ruled sheet a product page already uses for
 * its details.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Side column',
    description:
      'Beside the pages that open on their title (ordering, delivery, terms) and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the page',
    description: 'After a product, a category or a page, before the footer.',
  },
]
