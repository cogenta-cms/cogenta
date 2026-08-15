/**
 * The theme's stylesheet, flattened and minified for `cogenta serve`.
 *
 * `@cogenta/theme-canonical` ships `src/styles/theme.css` as three `@import`ed
 * layers — tokens, base, blocks. A real Astro build flattens those; this
 * fallback has no build, so it does the same one thing a bundler would and
 * nothing more: resolve the relative imports, drop the comments, squeeze the
 * whitespace. No rewriting of selectors, no reordering, no autoprefixing —
 * anything cleverer than that would make the served CSS differ from the CSS the
 * theme's own tests assert on.
 *
 * Until this existed, `cogenta serve` sent only the generated `--cogenta-*`
 * custom properties and never the sheet that *uses* them, so every page was
 * rendered by the browser's default stylesheet with a skin defined and unused.
 */

function squeeze(code: string): string {
  return (
    code
      .replace(/\s+/g, ' ')
      // Only around the three separators that can never be part of a value or a
      // combinator. `:` is left alone: removing the space in `@media
      // (min-width: 60rem)` is safe but removing it in a selector is not, and
      // telling the two apart needs a parser this deliberately is not.
      .replace(/\s*([{};,])\s*/g, '$1')
      .replace(/;}/g, '}')
  )
}

/**
 * One pass over the sheet, in which a comment, a string and code are three
 * different things and none of them is found with a regular expression.
 *
 * Both halves of that matter and each was a real bug first: an apostrophe in a
 * prose comment ("the editor's intent") opens a string for any scanner that
 * looks at quotes before comments, and swallows the rest of the file; and a
 * `content: " — "` whose spaces are squeezed loses the separator it draws.
 */
export function minifyCss(css: string): string {
  let out = ''
  let code = ''
  let index = 0

  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2)
      index = end === -1 ? css.length : end + 2
      // A comment is whitespace, not nothing: `.a/* x */.b` must not become
      // `.a.b`, which selects something else entirely.
      code += ' '
      continue
    }

    const character = css[index] as string
    if (character !== '"' && character !== "'") {
      code += character
      index += 1
      continue
    }

    out += squeeze(code)
    code = ''
    let end = index + 1
    while (end < css.length && css[end] !== character) {
      end += css[end] === '\\' ? 2 : 1
    }
    out += css.slice(index, Math.min(end + 1, css.length))
    index = end + 1
  }

  return (out + squeeze(code)).trim()
}

const IMPORT = /@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/g

export interface InlineImportsOptions {
  /** Reads a stylesheet given an absolute `file:` URL, as a string. */
  readonly read: (url: URL) => Promise<string>
  /** Guards against a cycle; also the honest limit on how deep a theme may nest. */
  readonly depth?: number
}

/**
 * Replaces every `@import "./x.css";` with the file's contents, recursively.
 *
 * Relative only, on purpose: a bare-specifier or `http(s)` import would let a
 * theme's stylesheet pull in a third party at render time, which is exactly the
 * kind of outside reach contract D refuses a theme elsewhere. Those are left
 * untouched for the browser to refuse or fetch as it sees fit.
 */
export async function inlineImports(entry: URL, options: InlineImportsOptions): Promise<string> {
  const depth = options.depth ?? 8
  const css = await options.read(entry)
  if (depth <= 0) return css

  const parts: string[] = []
  let cursor = 0
  for (const match of css.matchAll(IMPORT)) {
    const specifier = match[1] as string
    if (!specifier.startsWith('.')) continue
    const index = match.index ?? 0
    parts.push(css.slice(cursor, index))
    parts.push(
      await inlineImports(new URL(specifier, entry), { read: options.read, depth: depth - 1 }),
    )
    cursor = index + match[0].length
  }
  parts.push(css.slice(cursor))
  return parts.join('\n')
}

/**
 * The whole theme stylesheet as one minified string, or `null` when the theme
 * package cannot be resolved — a site then renders with the skin's custom
 * properties alone rather than refusing to serve, the same degradation
 * `loadSkinCss` already chose for a missing `theme.tokens.json`.
 */
/**
 * FNV-1a, 32 bits. A cache key, never a security boundary — and deliberately
 * not `node:crypto`, to match the hash `@cogenta/render` already uses for the
 * skin sheet's ETag rather than introduce a second convention beside it.
 */
export function cssEtag(css: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < css.length; index++) {
    value ^= css.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return `"${value.toString(16).padStart(8, '0')}"`
}

export async function loadThemeCss(options: InlineImportsOptions): Promise<string | null> {
  try {
    const entry = new URL(import.meta.resolve('@cogenta/theme-canonical/styles/theme.css'))
    return minifyCss(await inlineImports(entry, options))
  } catch {
    return null
  }
}
