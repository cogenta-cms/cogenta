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
import { escapeAttribute, type HtmlElement, h } from './html.js'

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

/** A labelled destination — a social profile, a header call-to-action. Nothing more, on purpose: contract D never carries an icon choice or an emphasis for these, only a URL and the words that name it. */
export interface ChromeLink {
  readonly label: string
  readonly href: string
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
  /**
   * `general.tagline` (contract D `theme@1.4`), in the page's own locale.
   * Optional and additive: a theme that never reads it, and a site that has
   * never set one, both render exactly as they did under `theme@1.3` — this
   * is what makes the version bump minor rather than major. A theme that does
   * show it places it beside the brand mark or in the footer's own "about"
   * column; it is prose, not a second `<h1>`.
   */
  readonly tagline?: string
  /**
   * `general.socialLinks` (contract D `theme@1.4`) — the site's own social
   * profiles, already resolved to `{label, href}` pairs. Absent or empty
   * means "nothing configured", identical to a pre-1.4 render. A theme is
   * free to render these itself, but `renderSocialLinks` below is the shared,
   * icon-carrying way every built-in theme does it, so five themes do not
   * each draw their own X/Mastodon/Bluesky glyphs from scratch.
   */
  readonly social?: readonly ChromeLink[]
  /**
   * `general.footerNote` (contract D `theme@1.4`) — a short, site-wide line
   * an editor writes once (a legal mention, an "about" sentence, an address)
   * and every theme's footer is free to show as its own short "about" column.
   * Plain text, already the caller's to escape like any other string field —
   * this module carries no HTML-bearing fields (R3 applies to a theme's own
   * markup exactly as it does to a block's).
   */
  readonly footerNote?: string
  /**
   * The first link of the menu assigned to the `header-action` location
   * (`resolveChromeExtras`, `@cogenta/cli`), if a site has assigned one —
   * absent otherwise. A theme that shows it renders a single button-styled
   * link at the end of its header nav ("Book a demo", "Get started",
   * "Contact"); a theme that ignores it loses nothing a pre-1.4 site had.
   */
  readonly headerAction?: ChromeLink
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

/**
 * The closed set of platforms `renderSocialLinks` draws a real icon for.
 * `'link'` is the fallback for anything else — a generic chain-link glyph
 * rather than no icon at all, since a footer that mixes one unrecognised URL
 * among five recognised ones must not have a visible gap in the row.
 */
type SocialIconKind =
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'youtube'
  | 'github'
  | 'mastodon'
  | 'bluesky'
  | 'tiktok'
  | 'threads'
  | 'pinterest'
  | 'link'

/** A circle, as two arcs — every icon below is built from this and `roundedRect`, never copied vector data. */
function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  )
}

/**
 * One or more `d` strings per platform. `fill-rule="evenodd"` is set once on
 * the `<svg>` root (inherited by every `<path>`, exactly like `fill`), which
 * is what turns two nested contours — instagram's frame and lens, YouTube's
 * frame around its play triangle, threads' loop — into a ring rather than a
 * solid blob, with no extra attribute anywhere else.
 */
const SOCIAL_ICON_PATHS: Readonly<Record<SocialIconKind, readonly string[]>> = {
  x: ['M4 4l6.7 8.1L4.2 20H7l5-6.1L17 20h2.8l-6.9-8.3L20.5 4h-2.8l-4.6 5.6L8.8 4H4z'],
  facebook: [
    'M14 4h-2.2A4.3 4.3 0 0 0 7.5 8.3V11H5v3h2.5v7h3.4v-7h2.6l.5-3h-3.1V8.6a1 1 0 0 1 1-1H14z',
  ],
  instagram: [
    roundedRect(3, 3, 18, 18, 5),
    roundedRect(6, 6, 12, 12, 3.5),
    circlePath(12, 12, 4.2),
    circlePath(12, 12, 2.6),
    circlePath(17, 7, 1.3),
  ],
  linkedin: [
    circlePath(6.5, 7, 1.6),
    roundedRect(5.2, 10, 2.6, 10, 1),
    'M10.5 20V10h3v1.5c1-1.3 2.3-2 4-2c2.8 0 4.5 1.9 4.5 5V20h-3v-5c0-1.6-.7-2.6-2.2-2.6c-1.4 0-2.3 1-2.3 2.6V20z',
  ],
  youtube: [roundedRect(2, 5, 20, 14, 5), roundedRect(4, 7, 16, 10, 3.5), 'M10 9l6 3-6 3z'],
  github: [
    circlePath(12, 11, 7),
    'M8.3 20v-2.1c-2-.5-3-1.4-3-3.3c0-1 .3-1.7 1-2.4c-.1-.5-.4-1.7.1-2.8c0 0 .9-.3 2.8 1a10 10 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1c.5 1.1.2 2.3.1 2.8c.7.7 1 1.4 1 2.4c0 1.9-1 2.8-3 3.3V20',
  ],
  mastodon: ['M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H10l-3 3v-3H8a4 4 0 0 1-4-4z'],
  bluesky: [
    'M12 9c-1.6-3-4.7-5-7-4c-1 3 .5 6.5 3.4 8c-2.9 1.5-4.4 5-3.4 8c2.3 1 5.4-1 7-4c1.6 3 4.7 5 7 4c1-3-.5-6.5-3.4-8c2.9-1.5 4.4-5 3.4-8c-2.3-1-5.4 1-7 4z',
  ],
  tiktok: [
    circlePath(8, 17, 3),
    roundedRect(9.4, 4, 2.4, 13, 1),
    'M11.8 4c.3 3.2 2.7 5.4 5.7 5.6v3c-2.1-.1-4-.8-5.7-2.1',
  ],
  threads: [circlePath(12, 12, 8), circlePath(13, 12, 4)],
  pinterest: [roundedRect(10.4, 9, 2.4, 11, 1.2), circlePath(12.6, 10, 2.6)],
  // The generic fallback — two overlapping rounded-rectangle rings, the
  // conventional "chain link" silhouette, each ring itself two nested
  // contours (outer minus inner) resolved by the same `fill-rule="evenodd"`
  // every other icon here relies on.
  link: [
    roundedRect(1, 8, 12, 8, 4),
    roundedRect(3.5, 10.5, 7, 3, 1.5),
    roundedRect(11, 8, 12, 8, 4),
    roundedRect(13.5, 10.5, 7, 3, 1.5),
  ],
}

/**
 * `x.com`/`twitter.com`, Facebook, Instagram, LinkedIn, YouTube, GitHub,
 * a Mastodon instance (any host whose path starts `/@`, since Mastodon is
 * federated and has no one domain), Bluesky, TikTok, Threads, Pinterest — and
 * `'link'` for anything else, including an unparseable URL.
 */
function socialIconKindFor(href: string): SocialIconKind {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return 'link'
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'x.com' || host === 'twitter.com') return 'x'
  if (host === 'facebook.com' || host.endsWith('.facebook.com')) return 'facebook'
  if (host === 'instagram.com') return 'instagram'
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
  if (host === 'github.com') return 'github'
  if (host === 'bsky.app') return 'bluesky'
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
  if (host === 'threads.net') return 'threads'
  if (host === 'pinterest.com' || host.endsWith('.pinterest.com') || host === 'pinterest.fr') {
    return 'pinterest'
  }
  if (url.pathname.startsWith('/@')) return 'mastodon'
  return 'link'
}

function socialIcon(kind: SocialIconKind, className: string | undefined): HtmlElement {
  return h(
    'svg',
    {
      class: className,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      'fill-rule': 'evenodd',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    SOCIAL_ICON_PATHS[kind].map((d) => h('path', { d })),
  )
}

/**
 * `general.socialLinks` (contract D `theme@1.4`), as a `<ul>` of icon links —
 * `null` when there is nothing to show, so a theme can write
 * `renderSocialLinks(input.social)` straight into its footer without a
 * conditional of its own.
 *
 * Every icon carries a visually-hidden text label (`cg-visually-hidden` — a
 * theme that renders this must define that class, the standard
 * clip-to-1px-and-hide technique, since `@cogenta/theme-kit` ships no CSS of
 * its own) so the link's accessible name is still the platform *and* the
 * label the site owner chose (`aria-label` would drop the wording an editor
 * wrote; hidden text keeps it). `rel="me noopener noreferrer"` on every link:
 * `me` is the [IndieWeb/Mastodon verification
 * relation](https://indieweb.org/rel-me), harmless everywhere else, and the
 * other two are the same external-link protection every theme already gives
 * an off-site `<a>`.
 */
export function renderSocialLinks(
  social: readonly ChromeLink[] | undefined,
  options: { readonly className?: string; readonly itemClassName?: string } = {},
): HtmlElement | null {
  if (social === undefined || social.length === 0) return null
  return h(
    'ul',
    { class: options.className },
    social.map((link) =>
      h(
        'li',
        { class: options.itemClassName },
        h(
          'a',
          { href: link.href, rel: 'me noopener noreferrer', target: '_blank' },
          socialIcon(socialIconKindFor(link.href), 'cg-social__icon'),
          h('span', { class: 'cg-visually-hidden' }, link.label),
        ),
      ),
    ),
  )
}
