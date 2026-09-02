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

import type { ImageSource } from './contract.js'
import { escapeAttribute } from './html.js'

/**
 * The site's own visual identity, as the appearance screen already stores it
 * — logo, dark-scheme logo, favicon (contract D `theme@1.3`).
 *
 * Optional on `ChromeInput` on purpose: a host that predates this field, and
 * a theme that chooses to ignore it, both keep the pre-1.3 behaviour of
 * setting the site *name* as text. A theme that does use it shows `logo`
 * **instead of** the name, and keeps the name as the image's accessible name
 * — never both, and never a logo with no accessible name.
 *
 * `logo`/`logoDark` are `ImageSource`s, not raw URLs, so a logo gets the same
 * `srcset` and intrinsic-size guarantees every other image on the page has.
 * `logoDark` is a *second* source, never a replacement: choosing between the
 * two is a `prefers-color-scheme` decision the browser makes at render time,
 * never one the server takes on the visitor's behalf — the server has no way
 * of knowing which scheme the visitor is in.
 *
 * `faviconUrl` travels here so a site's whole identity is one object, but it
 * is the *host* that writes `<link rel="icon">`: a theme owns `<header>` and
 * `<footer>`, never `<head>`.
 */
export interface ChromeBrand {
  /** The site's own name — what a theme shows when there is no logo, and the logo's accessible name when there is one. */
  readonly name: string
  /** `null` when no logo is set, when the chosen media is gone, or when it is not an image. */
  readonly logo: ImageSource | null
  /** The dark-scheme variant, or `null`. Offered beside `logo`, never instead of it. */
  readonly logoDark: ImageSource | null
  /** Site-relative URL of the favicon, or `null` for the host's own default. Rendered by the host, not by a theme. */
  readonly faviconUrl: string | null
}

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
  /**
   * The site's own identity (contract D `theme@1.3`). Absent means the
   * pre-1.3 behaviour — the site name, as text — which is what a host that
   * never wired this and a site that never uploaded a logo both get.
   */
  readonly brand?: ChromeBrand
}

export interface ChromeResult {
  readonly header: string
  readonly footer: string
}

/**
 * The site's logo, as one already-escaped HTML fragment — or `null` when the
 * site has no logo, which is the signal to fall back to the site name in
 * text.
 *
 * Shared here rather than written five times: the light/dark pair is a
 * `<picture>` with a `prefers-color-scheme` `<source>`, and getting that
 * wrong (picking a variant server-side, or dropping the accessible name) is
 * the same mistake in every theme. What each theme still owns is *where* the
 * mark goes and how it is sized — this returns markup, never layout.
 *
 * `alt` is the site name, always written: a logo announced by its file name
 * is the WCAG 1.1.1 failure this helper exists to make impossible.
 */
export function renderBrandMark(
  brand: ChromeBrand | undefined,
  options: { readonly className?: string } = {},
): string | null {
  if (brand === undefined || brand.logo === null) return null
  const classAttr =
    options.className === undefined ? '' : ` class="${escapeAttribute(options.className)}"`
  const img =
    `<img${classAttr} src="${escapeAttribute(brand.logo.src)}"` +
    `${brand.logo.srcset === '' ? '' : ` srcset="${escapeAttribute(brand.logo.srcset)}"`}` +
    ` width="${brand.logo.width}" height="${brand.logo.height}"` +
    ` alt="${escapeAttribute(brand.name)}" decoding="async">`
  if (brand.logoDark === null) return img
  const darkSet = brand.logoDark.srcset === '' ? brand.logoDark.src : brand.logoDark.srcset
  return (
    `<picture><source srcset="${escapeAttribute(darkSet)}" media="(prefers-color-scheme: dark)">` +
    `${img}</picture>`
  )
}
