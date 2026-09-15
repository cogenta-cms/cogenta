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
import type { WidgetAreas } from './widgets.js'

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
  /**
   * The footer's widget columns, `footer-1` to `footer-4`, resolved for this
   * page (contract D `theme@1.6`, L30). A theme places them above its footer
   * with `renderFooterWidgets`; absent means none to show.
   */
  readonly widgets?: WidgetAreas
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

/** A circle, as two arcs — the primitive-built glyphs below are made from this and `roundedRect`. */
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

type BrandGlyphKind = 'github' | 'mastodon' | 'bluesky' | 'tiktok' | 'threads' | 'pinterest'

/**
 * The official silhouettes of the platforms a primitive-built glyph could not
 * make recognisable (a head-shaped blob for GitHub, a speech bubble for
 * Mastodon), taken verbatim from Simple Icons 16.31.0, which is CC0-1.0.
 * Each is one path drawn with the default `nonzero` rule, as Simple Icons
 * requires; LinkedIn is not among them because Simple Icons removed it.
 */
const BRAND_GLYPHS: Readonly<Record<BrandGlyphKind, string>> = {
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  mastodon:
    'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z',
  bluesky:
    'M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  threads:
    'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z',
  pinterest:
    'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z',
}

function isBrandGlyph(kind: SocialIconKind): kind is BrandGlyphKind {
  return kind in BRAND_GLYPHS
}

/**
 * One or more **groups** of `d` strings per platform, each group rendered as
 * its own `<path>` element with `fill-rule="evenodd"` — every icon's own
 * `<svg>` root also sets it, but that alone is not what makes a nested
 * contour a ring rather than a solid blob: `evenodd` only cancels overlap
 * *within a single path's own subpaths*, never across sibling `<path>`
 * elements. Two contours meant to punch a hole in each other (instagram's
 * frame and lens, YouTube's frame around its play triangle, the generic
 * fallback's two chain-link rings) must be joined into **one** group's `d`;
 * a shape meant to sit solid *beside* another (linkedin's dot, stem and bowl;
 * instagram's own flash dot) stays
 * its own group so it is never accidentally subtracted from a neighbour it
 * happens to overlap.
 */
const SOCIAL_ICON_PATHS: Readonly<
  Record<Exclude<SocialIconKind, BrandGlyphKind>, readonly (readonly string[])[]>
> = {
  x: [['M4 4l6.7 8.1L4.2 20H7l5-6.1L17 20h2.8l-6.9-8.3L20.5 4h-2.8l-4.6 5.6L8.8 4H4z']],
  facebook: [
    ['M14 4h-2.2A4.3 4.3 0 0 0 7.5 8.3V11H5v3h2.5v7h3.4v-7h2.6l.5-3h-3.1V8.6a1 1 0 0 1 1-1H14z'],
  ],
  instagram: [
    // The square frame: outer body minus a smaller, concentric inner
    // rectangle, one path so `evenodd` actually punches the hole.
    [roundedRect(3, 3, 18, 18, 5), roundedRect(6, 6, 12, 12, 3.5)],
    // The lens: outer minus inner circle, same technique.
    [circlePath(12, 12, 4.2), circlePath(12, 12, 2.6)],
    // The flash dot — solid, and deliberately its own group: joining it into
    // either ring above would let `evenodd` cancel wherever it overlaps one.
    [circlePath(17, 7, 1.3)],
  ],
  linkedin: [
    [circlePath(6.5, 7, 1.6)],
    [roundedRect(5.2, 10, 2.6, 10, 1)],
    [
      'M10.5 20V10h3v1.5c1-1.3 2.3-2 4-2c2.8 0 4.5 1.9 4.5 5V20h-3v-5c0-1.6-.7-2.6-2.2-2.6c-1.4 0-2.3 1-2.3 2.6V20z',
    ],
  ],
  youtube: [
    // The frame: outer minus inner rounded rect, same ring technique as
    // instagram's own frame.
    [roundedRect(2, 5, 20, 14, 5), roundedRect(4, 7, 16, 10, 3.5)],
    // The play triangle — solid, its own group for the same reason as
    // instagram's flash dot above.
    ['M10 9l6 3-6 3z'],
  ],
  // The generic fallback — two overlapping rounded-rectangle rings, the
  // conventional "chain link" silhouette, each ring its own group (outer
  // minus inner, resolved by `evenodd` within that one path) rather than
  // four separate solid rectangles.
  link: [
    [roundedRect(1, 8, 12, 8, 4), roundedRect(3.5, 10.5, 7, 3, 1.5)],
    [roundedRect(11, 8, 12, 8, 4), roundedRect(13.5, 10.5, 7, 3, 1.5)],
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
  const attrs = {
    class: className,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  if (isBrandGlyph(kind)) {
    // Simple Icons fill the whole 24-unit box; the primitive glyphs keep a
    // 3-unit margin, so the brand paths are inset to the same optical size.
    return h(
      'svg',
      attrs,
      h('path', { d: BRAND_GLYPHS[kind], transform: 'translate(3 3) scale(0.75)' }),
    )
  }
  return h(
    'svg',
    { ...attrs, 'fill-rule': 'evenodd' },
    SOCIAL_ICON_PATHS[kind].map((group) => h('path', { d: group.join(' ') })),
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
