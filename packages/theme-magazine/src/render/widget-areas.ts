/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * colophon; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets as a rail.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Rail',
    description: 'Beside stories, section fronts and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the story',
    description: 'After an article or a page, before the comments.',
  },
]
