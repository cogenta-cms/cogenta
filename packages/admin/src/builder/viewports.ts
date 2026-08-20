/**
 * The three widths the builder previews at (L16 task 6).
 *
 * Real CSS pixel widths applied to the iframe's own layout, not a
 * `width: 100%`/percentage guess: the theme's own media queries then resolve
 * against the number here, which is the only way a responsive preview can be
 * trusted. A page rendered at "however much room the admin panel happens to
 * have" is not rendered at a real desktop width — on a laptop-sized admin
 * window with the builder's own side panels taking real estate, that room
 * can easily sit well below a real desktop breakpoint, silently showing the
 * theme's *narrower* layout under the "Ordinateur" label.
 *
 * 1440 is a common real desktop design width (not a specific device, same
 * spirit as 768/375 below); 768 is where a tablet's portrait layout sits;
 * 375 is the narrowest width still worth designing for.
 *
 * These numbers routinely exceed the space the preview panel actually has
 * (L20 audit point 10) — `PreviewFrame` is the one that reconciles the two,
 * by scaling its *display* down to fit while leaving the iframe's own layout
 * width exactly as declared here, so nothing about what the theme's media
 * queries see ever changes.
 */

export const VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const

export type Viewport = (typeof VIEWPORTS)[number]

export const VIEWPORT_WIDTHS: Readonly<Record<Viewport, number>> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}
