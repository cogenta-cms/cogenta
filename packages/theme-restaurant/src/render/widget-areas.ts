/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * charcoal footer, on the footer's own twelve columns; the page areas are
 * placed by the host in the shared `cg-sidebar-layout` markup, which
 * `styles/widgets.css` sets as the margin of a printed menu card.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Beside the page',
    description: 'Beside a dish, a page that opens on its title, and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the page',
    description: 'After a dish or a page, before the footer.',
  },
]
