/**
 * The chrome extension point — the one piece of a rendered page that used to
 * live outside every theme entirely: `cogenta serve` used to hand-write the
 * `<header>`/`<footer>` markup itself, hardcoded to one theme's CSS classes,
 * which is exactly what made a second theme impossible to install without
 * either fighting the first theme's chrome or losing chrome altogether.
 *
 * A theme now owns its own header and footer, the same way it owns its own
 * block layouts — `cogenta serve` resolves the navigation data and the
 * CMS-wide branding fragment (never a theme's business, see `brandingHtml`
 * below) and hands both to the active theme's `renderChrome`.
 */

export interface ChromeNavLink {
  readonly label: string
  /** `null` for a `submenu-placeholder` — an unlinked heading, not a dead link (a dead link is dropped before it reaches here). */
  readonly href: string | null
  readonly openInNewTab: boolean
  readonly kind: string
  /** The HTML `title` attribute (a tooltip), or `null`. Never this link's visible label. */
  readonly title: string | null
}

export interface ChromeInput {
  readonly site: { readonly name: string }
  readonly locale: string
  /** `/`, already locale-resolved — the target of the site's own "home" link. */
  readonly homeHref: string
  readonly headerNav: readonly ChromeNavLink[]
  readonly footerNav: readonly ChromeNavLink[]
  /**
   * Cogenta's own credit, or its white-label replacement, or `''` for
   * neither (fiche L21 task 8) — already-escaped HTML, computed once by
   * `cogenta serve` from a site-wide setting no theme may reinterpret. A
   * theme places this fragment somewhere inside its own footer; it must not
   * alter or drop it on its own initiative.
   */
  readonly brandingHtml: string
}

export interface ChromeResult {
  readonly header: string
  readonly footer: string
}
