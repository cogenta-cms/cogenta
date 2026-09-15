/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * green band; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets as the side
 * column of a noticeboard: short labels, ruled lists, photographs, and the
 * ask on the paper band.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Side column',
    description: 'Beside an event, a programme and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the page',
    description: 'After an event, a programme or a page, before the comments.',
  },
]
