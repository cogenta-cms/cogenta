/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * footer; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets as a quiet side
 * column on the page's own grid.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Side column',
    description: 'Beside changelog entries, feature pages, archives and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the page',
    description: 'After a changelog entry, a feature page or a page, before the footer.',
  },
]
