/**
 * The offline page.
 *
 * It has one job and one honesty requirement: say that the *network* is
 * missing, not that the site is broken, and never render an empty shell. A
 * blank page is indistinguishable from a crashed site, so a visitor reloads,
 * blames the site, and leaves.
 *
 * It is fully self-contained — inline styles, no font, no image, no external
 * stylesheet — because every external reference is one more thing that must
 * have been cached for the page to render at the exact moment nothing can be
 * fetched. It styles itself from the skin custom properties when they happen to
 * be defined, and falls back to literal values when they are not.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

export interface OfflinePageOptions {
  readonly siteName: string
  /** BCP 47 tag. Drives the `lang` attribute, so screen readers pronounce it. */
  readonly lang: string
  readonly dir?: 'ltr' | 'rtl' | 'auto'
  /** Heading. Must state that the visitor is offline. */
  readonly title?: string
  readonly message?: string
  readonly retryLabel?: string
  /** Shown once the browser reports the connection is back. */
  readonly restoredLabel?: string
  /**
   * Whether to include the retry script. Disable it on a site whose CSP has no
   * hash or nonce for inline scripts; the page still renders and still tells
   * the truth, it just cannot retry by itself.
   */
  readonly interactive?: boolean
}

/**
 * The inline script, exported so a strict CSP can hash it
 * (`script-src 'sha256-…'`) instead of loosening to `unsafe-inline`.
 *
 * It does two things and nothing else: reload on demand, and notice when the
 * connection returns. `navigator.onLine` is famously optimistic — it reports a
 * live network adapter, not a reachable site — so it is used only to *offer* a
 * reload, never to claim the site is back.
 */
export const OFFLINE_PAGE_SCRIPT = [
  '(function () {',
  '  var button = document.getElementById("cogenta-offline-retry")',
  '  var status = document.getElementById("cogenta-offline-status")',
  '  if (button) button.addEventListener("click", function () { location.reload() })',
  '  addEventListener("online", function () { if (status) status.hidden = false })',
  '})()',
].join('\n')

const STYLE = [
  ':root{color-scheme:light dark}',
  'body{margin:0;min-height:100vh;display:grid;place-items:center;',
  'padding:var(--cogenta-space-unit,1rem);',
  'background:var(--cogenta-color-bg,#fff);color:var(--cogenta-color-fg,#111);',
  'font-family:var(--cogenta-font-sans,system-ui,sans-serif);line-height:1.5}',
  'main{max-width:34rem;text-align:center}',
  'h1{font-size:var(--cogenta-font-size-xl,1.75rem);margin:0 0 .5rem}',
  'p{margin:0 0 1.5rem;color:var(--cogenta-color-muted-fg,#555)}',
  'button{font:inherit;cursor:pointer;padding:.6rem 1.2rem;',
  'border:1px solid var(--cogenta-color-border,#ccc);',
  'border-radius:var(--cogenta-radius-md,.375rem);',
  'background:var(--cogenta-color-accent,#111);color:var(--cogenta-color-accent-fg,#fff)}',
  '[hidden]{display:none}',
].join('')

export function renderOfflinePage(options: OfflinePageOptions): string {
  const lang = escapeHtml(options.lang)
  const dir = options.dir ?? 'ltr'
  const siteName = escapeHtml(options.siteName)
  const title = escapeHtml(options.title ?? 'You are offline')
  const message = escapeHtml(
    options.message ??
      'This page has not been downloaded yet, and there is no connection to fetch it. Everything you have already visited is still available.',
  )
  const retryLabel = escapeHtml(options.retryLabel ?? 'Try again')
  const restoredLabel = escapeHtml(options.restoredLabel ?? 'The connection is back.')
  const interactive = options.interactive ?? true

  return [
    '<!doctype html>',
    `<html lang="${lang}" dir="${dir}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // Not indexable, and never a canonical answer for a real URL.
    '<meta name="robots" content="noindex">',
    `<title>${title} · ${siteName}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${title}</h1>`,
    `<p>${message}</p>`,
    interactive
      ? `<p id="cogenta-offline-status" hidden>${restoredLabel}</p><button id="cogenta-offline-retry" type="button">${retryLabel}</button>`
      : '',
    '</main>',
    interactive ? `<script>${OFFLINE_PAGE_SCRIPT}</script>` : '',
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
}
