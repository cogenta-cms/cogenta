/**
 * The widget areas this theme names (contract D `theme@1.6`). Declaring them
 * is what tells the host this theme draws the footer columns inside its own
 * colophon, on the footer's twelve columns; the page areas are placed by the
 * host in the shared `cg-sidebar-layout` markup, which `styles/widgets.css`
 * sets on the page's own grid: the column beside the content takes the last
 * columns of the twelve, the way the header's navigation does.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Beside the page',
    description:
      'Beside an index of work (a discipline, a client, a member of the team) and search results.',
  },
  {
    id: 'content-after',
    label: 'After the work',
    description: 'Under a project or a page, before the footer: more work, a way to get in touch.',
  },
]
