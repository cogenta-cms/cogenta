/**
 * What a plugin's stylesheet may contain (L32).
 *
 * A plugin ships static CSS in its package for the blocks and widgets it
 * provides, and the host serves it from the site's own origin. That is only
 * safe because of what this refuses:
 *
 * - `@import` — a stylesheet that pulls in another is a stylesheet whose
 *   contents the host never read;
 * - any `url()` that is not an inline image — a remote URL in a selector is
 *   how CSS becomes an exfiltration channel ("if this attribute is present,
 *   fetch this"), and a stylesheet that cannot fetch cannot do it;
 * - `expression(`, `behavior:`, `-moz-binding`, `javascript:` — script under
 *   another name;
 * - markup, which would mean the file is not a stylesheet at all.
 *
 * Comments are removed before any of that is looked for. Without it, a
 * stylesheet that *documents* the rule ("no `@import` here") would be refused
 * for saying so, and CSS tokenisation gives a comment no way to hide a real
 * at-rule anyway.
 *
 * Refusals are whole: a stylesheet that fails is not served, and the plugin's
 * markup renders unstyled. Nothing here edits someone's CSS into something
 * they did not write.
 */

/** Past this a "stylesheet" is a payload; the largest theme in this repository is well under it. */
export const MAX_PLUGIN_STYLESHEET_BYTES = 64 * 1024

export interface PluginStylesheetCheck {
  readonly ok: boolean
  readonly reason?: string
}

const REFUSED: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /@import/iu, reason: '@import: a stylesheet this host never read' },
  { pattern: /expression\s*\(/iu, reason: 'expression(): script by another name' },
  { pattern: /behaviou?r\s*:/iu, reason: 'behavior: script by another name' },
  { pattern: /-moz-binding/iu, reason: '-moz-binding: script by another name' },
  { pattern: /javascript\s*:/iu, reason: 'javascript: URL' },
  { pattern: /<\/?[a-z]/iu, reason: 'markup inside a stylesheet' },
]

/** CSS comments removed, so a rule this file documents is not mistaken for a rule it breaks. */
export function stripCssComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
}

/** Every `url(...)` a stylesheet uses, unquoted. */
export function stylesheetUrls(css: string): readonly string[] {
  const found: string[] = []
  for (const match of stripCssComments(css).matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/giu)) {
    found.push((match[2] ?? '').trim())
  }
  return found
}

export function checkPluginStylesheet(css: string): PluginStylesheetCheck {
  if (css.length > MAX_PLUGIN_STYLESHEET_BYTES) {
    return { ok: false, reason: `larger than ${MAX_PLUGIN_STYLESHEET_BYTES} bytes` }
  }
  const body = stripCssComments(css)
  for (const rule of REFUSED) {
    if (rule.pattern.test(body)) return { ok: false, reason: rule.reason }
  }
  for (const url of stylesheetUrls(css)) {
    // An inline image is the one thing a plugin may draw with: it carries its
    // own bytes, so it fetches nothing and reports nothing.
    if (url.toLowerCase().startsWith('data:image/')) continue
    return { ok: false, reason: `url(${url}): a stylesheet may only use inline images` }
  }
  return { ok: true }
}
