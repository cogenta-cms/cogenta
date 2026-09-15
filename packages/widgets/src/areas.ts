/**
 * The widget areas every theme receives (L30 D2).
 *
 * A theme places them in its own layout, and may declare more of its own.
 * A theme that declares none still gets them: the host places them where
 * they can never break a layout (bands before and after the content, columns
 * above the footer, the sidebar stacked after the content).
 */

export interface WidgetAreaDeclaration {
  /** Stable key: lower case, digits and dashes. Stored on every widget of the area. */
  readonly id: string
  /** The name shown in the admin, in English; the admin translates the standard ones. */
  readonly label: string
  readonly description?: string
}

export const STANDARD_WIDGET_AREAS: readonly WidgetAreaDeclaration[] = [
  {
    id: 'sidebar',
    label: 'Sidebar',
    description: 'Beside articles, archives and search results.',
  },
  { id: 'content-before', label: 'Before the content', description: 'A band above the content.' },
  {
    id: 'content-after',
    label: 'After the content',
    description: 'Below an article or a page, before comments.',
  },
  { id: 'footer-1', label: 'Footer, column 1' },
  { id: 'footer-2', label: 'Footer, column 2' },
  { id: 'footer-3', label: 'Footer, column 3' },
  { id: 'footer-4', label: 'Footer, column 4' },
]

export const FOOTER_WIDGET_AREAS: readonly string[] = [
  'footer-1',
  'footer-2',
  'footer-3',
  'footer-4',
]

const AREA_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u

export function isWidgetAreaId(value: unknown): value is string {
  return typeof value === 'string' && AREA_ID.test(value)
}

/**
 * The areas a site offers with a given theme: the standard ones, then the
 * theme's own, a theme declaration replacing a standard one of the same id
 * (so a theme can rename "Sidebar" to "Article rail").
 */
export function widgetAreasFor(
  themeAreas: readonly WidgetAreaDeclaration[] | undefined,
): readonly WidgetAreaDeclaration[] {
  const own = (themeAreas ?? []).filter((area) => isWidgetAreaId(area.id))
  const byId = new Map(own.map((area) => [area.id, area]))
  const standard = STANDARD_WIDGET_AREAS.map((area) => byId.get(area.id) ?? area)
  const extra = own.filter((area) => !STANDARD_WIDGET_AREAS.some((item) => item.id === area.id))
  return [...standard, ...extra]
}
