import { createHash } from 'node:crypto'
import { THEME_TOGGLE_SCRIPT } from '@cogenta/theme-kit'
import { FORM_CONDITIONS_SCRIPT } from './forms-page.js'

/**
 * The Content-Security-Policy `cogenta serve` sends when the site configures
 * none (pentest F-04, first part).
 *
 * The goal is one property: **no script a visitor-supplied string could
 * smuggle into a page ever runs**. `script-src` therefore never contains
 * `'unsafe-inline'`. The two inline scripts the server itself emits are
 * allowed by the sha256 of their exact text — computed here from the same
 * constants the page templates interpolate, so a template that changes the
 * script changes the hash with it. A third inline script would simply not run
 * until it is added to this file on purpose.
 *
 * `style-src` keeps `'unsafe-inline'`: the themes and the form page write
 * `style="--cg-ratio:…"` attributes and `<style>` floors, none of which can
 * execute code. Restricting them would buy nothing against the threat above
 * and cost a rewrite of every theme.
 *
 * Four classes of path, because the four have different needs:
 * - the admin application (a built SPA: external module script, React styles
 *   through the CSSOM, `blob:`/`data:` images in the media and crop editors);
 * - the public site (the theme-toggle hash, the consented-embed frame hosts);
 * - form pages, which add their own script hash and, when a form enables
 *   Turnstile, Cloudflare's challenge origin — and nowhere else;
 * - the JSON API, which has no business loading anything.
 *
 * Plugin routes (`/_cogenta/plugins/…`) and the theme sandbox preview send a
 * stricter policy of their own, and a route's own header wins over this one.
 */

export type CspClass = 'admin' | 'public' | 'form' | 'api'

/** `'sha256-…'` as a CSP source expression, of the exact text between the tags. */
export function cspHashOf(scriptText: string): string {
  return `'sha256-${createHash('sha256').update(scriptText, 'utf8').digest('base64')}'`
}

/** The hash allowing `<script>${THEME_TOGGLE_SCRIPT}</script>`, and nothing else. */
export const THEME_TOGGLE_SCRIPT_HASH = cspHashOf(THEME_TOGGLE_SCRIPT)
/** The hash allowing the conditional-fields script of a form page. */
export const FORM_CONDITIONS_SCRIPT_HASH = cspHashOf(FORM_CONDITIONS_SCRIPT)

/** Cloudflare's Turnstile widget: a script, the challenge iframe and its verification calls. */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * The hosts a *consented* embed may frame — exactly the ones the themes'
 * `frameSource()` and the embed widget's `embedFrameSource()` can produce.
 * Before consent a block renders a link card with no frame at all.
 */
const EMBED_FRAME_HOSTS: readonly string[] = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://geo.dailymotion.com',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
]

/** Google Fonts, only when the site opted in with `appearance.remoteWebFonts`. */
const GOOGLE_FONTS_STYLES = 'https://fonts.googleapis.com'
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com'

export interface DefaultCspOptions {
  /** `appearance.remoteWebFonts`: the skin's CSS imports a Google Fonts stylesheet. */
  readonly remoteWebFonts: boolean
}

/** Which policy a path gets. */
export function cspClassFor(pathname: string): CspClass {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  // A form page is also the answer to a failed `POST /api/forms/{name}/submit`
  // (the visitor needs the page back, not JSON), so that one API path is a page.
  if (pathname.startsWith('/forms/') || /^\/api\/forms\/[^/]+\/submit$/u.test(pathname)) {
    return 'form'
  }
  if (pathname.startsWith('/api/')) return 'api'
  return 'public'
}

function directives(entries: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(entries)
    .map(([name, sources]) => (sources.length === 0 ? name : `${name} ${sources.join(' ')}`))
    .join('; ')
}

/** The policy for one class of path. Pure: the same inputs give the same string. */
export function buildDefaultCsp(kind: CspClass, options: DefaultCspOptions): string {
  const fonts = options.remoteWebFonts
  const styleSources = ["'self'", "'unsafe-inline'", ...(fonts ? [GOOGLE_FONTS_STYLES] : [])]
  const fontSources = ["'self'", ...(fonts ? [GOOGLE_FONTS_FILES] : [])]

  switch (kind) {
    case 'api':
      // JSON (and downloads) only. `frame-ancestors 'self'` rather than
      // `'none'` because the admin may show an uploaded PDF in a frame.
      return directives({
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'self'"],
      })
    case 'admin':
      return directives({
        'default-src': ["'self'"],
        'script-src': ["'self'", THEME_TOGGLE_SCRIPT_HASH],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'self'"],
        'form-action': ["'self'"],
        // `data:`/`blob:` for the image editor's canvas and the upload previews.
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'style-src': styleSources,
        'font-src': fontSources,
        'connect-src': ["'self'"],
        // The builder and theme previews are `srcdoc` frames of the public
        // page; a consented embed in one needs the same hosts as the page.
        'frame-src': ["'self'", ...EMBED_FRAME_HOSTS],
        'worker-src': ["'self'", 'blob:'],
      })
    case 'form':
    case 'public': {
      const scripts = [
        "'self'",
        THEME_TOGGLE_SCRIPT_HASH,
        ...(kind === 'form' ? [FORM_CONDITIONS_SCRIPT_HASH, TURNSTILE_ORIGIN] : []),
      ]
      return directives({
        'default-src': ["'self'"],
        'script-src': scripts,
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'self'"],
        'form-action': ["'self'"],
        // Images from any HTTPS host: a plugin block or an imported page may
        // legitimately hot-link one, and an image cannot run code.
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'https:'],
        'style-src': styleSources,
        'font-src': fontSources,
        'connect-src': ["'self'", ...(kind === 'form' ? [TURNSTILE_ORIGIN] : [])],
        'frame-src': [...EMBED_FRAME_HOSTS, ...(kind === 'form' ? [TURNSTILE_ORIGIN] : [])],
      })
    }
  }
}

const cache = new Map<string, string>()

/** `buildDefaultCsp`, memoised: it runs on every response. */
export function defaultCspFor(pathname: string, options: DefaultCspOptions): string {
  const kind = cspClassFor(pathname)
  const key = `${kind}:${options.remoteWebFonts}`
  const known = cache.get(key)
  if (known !== undefined) return known
  const built = buildDefaultCsp(kind, options)
  cache.set(key, built)
  return built
}
