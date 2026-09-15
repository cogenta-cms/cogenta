/**
 * The widget areas this theme names (contract D `theme@1.6`).
 *
 * Exporting `widgetAreas` is what tells the host that this theme draws the
 * footer columns (`footer-1`..`footer-4`) inside its own footer, where
 * `renderChrome` places them between the footer menu and the legal line. The
 * page areas (`content-before`, `content-after`, `sidebar`) are placed by the
 * host in the one `cg-sidebar-layout` markup every theme styles; this theme
 * sets it on its twelve-column grid in `styles/widgets.css`.
 *
 * A third-party theme can copy this file as it is: a theme that adds an area
 * of its own lists it here too, and renders it itself with
 * `renderWidgetArea` from `@cogenta/theme-kit`.
 */
export const widgetAreas: readonly {
  readonly id: string
  readonly label: string
  readonly description?: string
}[] = [
  {
    id: 'sidebar',
    label: 'Sidebar',
    description:
      'Beside an entry, an archive or search results on a wide screen; under the content on a phone and on the home page.',
  },
  {
    id: 'content-before',
    label: 'Before the content',
    description: 'At the top of the page, under the header.',
  },
  {
    id: 'content-after',
    label: 'After the content',
    description: 'Under the page’s own content, before the comments.',
  },
  {
    id: 'footer-1',
    label: 'Footer, column 1',
    description: 'In the footer, between the footer menu and the legal line.',
  },
  { id: 'footer-2', label: 'Footer, column 2' },
  { id: 'footer-3', label: 'Footer, column 3' },
  { id: 'footer-4', label: 'Footer, column 4' },
]
