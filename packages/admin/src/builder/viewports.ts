/**
 * The three widths the builder previews at (L16 task 6).
 *
 * Real CSS pixel widths applied to a real iframe, not a scale transform: the
 * theme's own media queries then resolve at the width shown, which is the only
 * way a responsive preview can be trusted. A scaled screenshot of a desktop
 * layout would show a phone-shaped desktop page and call it a phone.
 *
 * The numbers are the narrow edge of a common device class rather than a
 * specific product — 375 is the smallest width still worth designing for, 768
 * is where a tablet's portrait layout sits, and desktop is simply "as much
 * room as the panel has".
 */

export const VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const

export type Viewport = (typeof VIEWPORTS)[number]

export const VIEWPORT_WIDTHS: Readonly<Record<Viewport, string>> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
}
