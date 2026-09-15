/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * footer; the page areas are placed by the host in the shared
 * `cg-sidebar-layout` markup, which `styles/widgets.css` sets as the side
 * column of a firm's report.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Side column',
    description: 'Beside a case study, a practice, a sector and search results.',
  },
  {
    id: 'content-after',
    label: 'Under the text',
    description: 'After a case study, a practice or a page, before the comments.',
  },
]
