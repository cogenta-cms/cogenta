import { type HtmlElement, h } from './html.js'

/**
 * Inline icons for the block vocabulary's `icon: string` fields (contract B —
 * `featureGrid` items, and any future block that names one the same way).
 *
 * Contract B stores a *symbol name*, never markup (R3) — a block cannot carry
 * its own `<svg>`, so until this module existed every theme rendered
 * `<span data-icon="…">` with nothing inside it: the name reached the page,
 * but nothing visible ever did. This is the shared, zero-dependency mapping
 * from that name to a real icon, written once here rather than five times
 * (one per theme package) the way `renderSocialLinks`/`renderBrandMark`
 * already are for their own corner of a page's chrome.
 *
 * Every path is authored directly for this file — outline style, a single
 * `stroke-width`, no copied icon-library data, no external font or sprite
 * sheet (R9/R10). `renderIcon` returns `null` for a name outside the closed
 * list below, which is a *theme's* signal to fall back to whatever it
 * rendered before this module existed — never a placeholder glyph that would
 * itself need explaining.
 */

export const ICON_NAMES = [
  'check',
  'star',
  'bolt',
  'shield',
  'chart',
  'users',
  'user',
  'globe',
  'clock',
  'heart',
  'leaf',
  'mail',
  'phone',
  'map-pin',
  'calendar',
  'book',
  'code',
  'cloud',
  'lock',
  'search',
  'settings',
  'sparkles',
  'truck',
  'credit-card',
  'gift',
  'coffee',
  'utensils',
  'wine',
  'camera',
  'pen',
  'layers',
  'rocket',
  'trending-up',
  'award',
  'smile',
  'sun',
  'moon',
  'arrow-right',
  'arrow-up-right',
  'external-link',
  'download',
  'play',
  'quote',
  'tag',
  'briefcase',
  'home',
  'message',
  'bell',
  'refresh',
  'image',
  'zap',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const NAME_SET: ReadonlySet<string> = new Set(ICON_NAMES)

/** A circle, as two path arcs — `<path>` is the only shape this module emits (see the module comment). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

/** One `<path>` per icon, built from the `d` strings below — most icons need only one; a few need two or three distinct strokes. */
const PATHS: Readonly<Record<IconName, readonly string[]>> = {
  check: ['M4 13l5 5L20 6'],
  star: ['M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z'],
  bolt: ['M13 2 4 14h6l-1 8 9-12h-6z'],
  shield: ['M12 2 20 5.5v5.5c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5.5z'],
  chart: ['M4 20V12M10 20V7M16 20V4M3 20h18'],
  users: [
    circle(9, 8, 3),
    circle(17.5, 9.5, 2.3),
    'M2.5 20a6.5 6.5 0 0 1 13 0M14.8 14.5c2.2.4 4 2.3 4.6 5.5',
  ],
  user: [circle(12, 8, 3.5), 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  globe: [circle(12, 12, 9), 'M3 12h18', 'M12 3c-3.3 4-3.3 14 0 18c3.3-4 3.3-14 0-18'],
  clock: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  heart: [
    'M12 20S3 14.5 3 8.5C3 5.5 5.2 3.5 8 3.5c1.8 0 3.2 1 4 2.4c.8-1.4 2.2-2.4 4-2.4c2.8 0 5 2 5 5c0 6-9 11.5-9 11.5z',
  ],
  leaf: ['M20 4c-9 0-16 7-16 16c9 0 16-7 16-16z', 'M4 20 12 12'],
  mail: ['M3 5h18v14H3z', 'M4 6l8 7 8-7'],
  phone: [
    'M5 3h4l2 5-2.5 2.4a12 12 0 0 0 6.1 6.1L17 14l5 2v4a2 2 0 0 1-2.2 2C10.6 21.6 2.4 13.4 2 4.2A2 2 0 0 1 4 2z',
  ],
  'map-pin': ['M12 22s7-7.4 7-12.8a7 7 0 0 0-14 0C5 14.6 12 22 12 22z', circle(12, 9.2, 2.4)],
  calendar: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  book: ['M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z', 'M20 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z'],
  code: ['M8 6 2 12l6 6', 'M16 6l6 6-6 6'],
  cloud: ['M6.5 18a4.2 4.2 0 0 1 .5-8.4A5.6 5.6 0 0 1 17.7 9.9A4.1 4.1 0 0 1 17 18z'],
  lock: ['M5 11h14v10H5z', 'M7.5 11V7a4.5 4.5 0 0 1 9 0v4'],
  search: [circle(11, 11, 7), 'M21 21l-5-5'],
  settings: [circle(12, 12, 3), circle(12, 12, 8)],
  sparkles: [
    'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z',
    'M19 14l.6 1.8 1.9.6-1.9.6L19 19l-.6-1.8-1.9-.6 1.9-.6z',
  ],
  truck: ['M1 7h13v10H1z', 'M14 10h4l4 3.5V17h-8z', circle(6, 19, 1.8), circle(17.5, 19, 1.8)],
  'credit-card': ['M2 5h20v14H2z', 'M2 10h20'],
  gift: ['M3 9h18v12H3z', 'M12 9v12', 'M6 9c0-3 4.5-4 6-1c1.5-3 6-2 6 1z'],
  coffee: ['M4 9h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z', 'M16 11h1a2.5 2.5 0 0 1 0 5h-1', 'M8 3v5'],
  utensils: [
    'M6 2v9M4 2v5a2 2 0 0 0 4 0V2M6 11v11',
    'M18 2c-1.5 3-1.5 6 0 8c0 4-1 12-1 12',
    'M18 2v8',
  ],
  wine: ['M7 3h10l-1 8a4 4 0 0 1-8 0z', 'M12 15v6', 'M8 21h8'],
  camera: ['M3 8h4l2-3h6l2 3h4v12H3z', circle(12, 14, 4)],
  pen: ['M3 21l4-1 12-12-3-3L4 17z', 'M14 5l3 3'],
  layers: ['M12 3 3 8l9 5 9-5z', 'M3 13l9 5 9-5', 'M3 18l9 5 9-5'],
  rocket: [
    'M12 2c3.5 1 6 4.5 6 9c0 3-1.5 6-3 8l-3-2-3 2c-1.5-2-3-5-3-8c0-4.5 2.5-8 6-9z',
    'M9 17l-3 4M15 17l3 4',
    circle(12, 10, 2),
  ],
  'trending-up': ['M3 17l6-6 4 4 8-9', 'M15 6h6v6'],
  award: [circle(12, 8, 5), 'M9 12.5 7 22l5-3 5 3-2-9.5'],
  smile: [circle(12, 12, 9), 'M8 14c1.2 1.5 2.6 2.2 4 2.2s2.8-.7 4-2.2', 'M8.5 9h.01M15.5 9h.01'],
  sun: [
    circle(12, 12, 4.5),
    'M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ],
  moon: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'],
  'arrow-right': ['M4 12h16', 'M13 5l7 7-7 7'],
  'arrow-up-right': ['M6 18 18 6', 'M8 6h10v10'],
  'external-link': ['M9 5H5v14h14v-4', 'M13 3h8v8', 'M21 3 11 13'],
  download: ['M12 3v13', 'M6 11l6 6 6-6', 'M4 21h16'],
  play: ['M6 3l16 9-16 9z'],
  quote: [
    'M4 8c0-3 2-5 5-5v3c-1.5 0-2.5 1-2.5 2.5H9v6H4z',
    'M13 8c0-3 2-5 5-5v3c-1.5 0-2.5 1-2.5 2.5H18v6h-5z',
  ],
  tag: ['M3 12 12 3h6a3 3 0 0 1 3 3v6l-9 9z', circle(15, 9, 1.6)],
  briefcase: ['M3 8h18v11H3z', 'M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  home: ['M4 11 12 4l8 7', 'M6 10v10h12V10'],
  message: ['M4 4h16v11H9l-5 4z'],
  bell: ['M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z', 'M10 20a2 2 0 0 0 4 0'],
  refresh: ['M4 4v6h6', 'M20 20v-6h-6', 'M4.5 15a8 8 0 0 0 14.6 2.5M19.5 9A8 8 0 0 0 4.9 6.5'],
  image: ['M3 4h18v16H3z', circle(9, 10, 2), 'M3 17l5-5 4 4 5-6 4 5'],
  zap: ['M13 2 4 14h6l-1 8 9-12h-6z'],
}

/**
 * One `<svg viewBox="0 0 24 24">` per known name, `null` for anything else —
 * a theme's own fallback (usually the pre-icon `<span data-icon>`, kept for
 * the page builder to key off) applies exactly as it did before this module
 * existed.
 *
 * `aria-hidden`/`focusable="false"`: the icon is always beside a text label
 * (a feature's own title) that already carries the accessible name — an icon
 * that duplicated it would be announced twice.
 */
export function renderIcon(
  name: string,
  options: { readonly className?: string; readonly size?: number } = {},
): HtmlElement | null {
  if (!NAME_SET.has(name)) return null
  const paths = PATHS[name as IconName]
  const size = options.size ?? 24
  return h(
    'svg',
    {
      class: options.className,
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    paths.map((d) => h('path', { d })),
  )
}
