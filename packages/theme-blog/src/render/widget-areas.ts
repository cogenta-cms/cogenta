/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * colophon; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets on this theme's
 * twelve-column grid: the essay keeps its margin and its text line, and the
 * sidebar takes the last three columns.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Sidebar',
    description: 'Beside essays, subject and tag archives and search results.',
  },
  {
    id: 'content-after',
    label: 'After the essay',
    description: 'On the text line after an essay or a page, before the comments.',
  },
]
