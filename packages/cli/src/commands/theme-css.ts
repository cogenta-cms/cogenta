import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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

/**
 * The whole theme stylesheet as one minified string, or `null` when the named
 * theme cannot be resolved — a site then renders with the skin's custom
 * properties alone rather than refusing to serve, the same degradation
 * `loadSkinCss` already chose for a missing `theme.tokens.json`.
 *
 * Two resolution routes, tried in order:
 *
 * 1. **Local** — `<projectRoot>/themes/<name>/theme.css`, next to that
 *    theme's own `theme.config.*`/`theme.render.*` (fiche 73's own real bug,
 *    found by a live E2E test that deployed and activated a real
 *    agent-written theme, then looked at the actual rendered page: the class
 *    names `theme.write_sandbox_file` tells a model to emit were always
 *    there, but nothing ever served a stylesheet to give them any visual
 *    meaning — every sandbox-deployed theme rendered as unstyled text
 *    forever, silently, since this route did not exist at all). Optional:
 *    a theme that ships no `theme.css` is not an error, only unstyled.
 * 2. **npm package** — every theme package publishes its stylesheet at the
 *    same `./styles/theme.css` export subpath (contract D, mirrored by
 *    every theme package's `package.json`), so this stays a one-line lookup
 *    regardless of which built-in theme is active.
 *
 * Tried in this order because a local theme has no `package.json` `exports`
 * map for `import.meta.resolve` to find in the first place — the local
 * route is the only one a theme dropped straight into `themes/` can ever
 * satisfy, and a name that happens to collide with an installed package is
 * already resolved to the local folder everywhere else in this file
 * (`theme-registry.ts`'s own `BY_NAME` shadow-prevention aside — a local
 * theme is never given a name a built-in already owns).
 */
export async function loadThemeCss(
  options: InlineImportsOptions,
  themeName: string,
  localThemeRoot?: string,
): Promise<string | null> {
  if (localThemeRoot !== undefined) {
    const local = await loadLocalThemeCss(localThemeRoot, options)
    // A built-in theme's *name* never has a local folder in the first
    // place, so a local theme root with nothing to find always falls
    // through to the npm route below rather than short-circuiting here.
    if (local !== null) return local
  }
  try {
    const entry = new URL(import.meta.resolve(`${themeName}/styles/theme.css`))
    return minifyCss(await inlineImports(entry, options))
  } catch {
    return null
  }
}

/**
 * No required file name — `theme.render.*` names three candidates because a
 * theme is exactly one render module, but a theme's CSS is not "one file
 * with a fixed name" the same way: every `*.css` sitting directly in the
 * theme's own root is read and concatenated, in name order (deterministic,
 * and matching how a human would expect `1-base.css` before `2-blocks.css`
 * to read). Call it `theme.css`, `style.css`, `main.css`, split across ten
 * files — all of it is picked up, none of it needs a name this function
 * happens to expect. `@import "./x.css"` inside any of them still resolves
 * relatively, same as the npm route already does.
 */
export async function loadLocalThemeCss(
  themeRoot: string,
  options: InlineImportsOptions,
): Promise<string | null> {
  let entries: string[]
  try {
    entries = (await readdir(themeRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return null
  }
  if (entries.length === 0) return null

  const sheets = await Promise.all(
    entries.map((name) => inlineImports(pathToFileURL(join(themeRoot, name)), options)),
  )
  return minifyCss(sheets.join('\n'))
}

export interface ThemeCssResolverOptions extends InlineImportsOptions {
  /** Enables the local route above for every call — absent only in a test harness that never renders a local theme. */
  readonly projectRoot?: string
}

const themeCssCache = new Map<string, Promise<string | null>>()

/**
 * A theme's own stylesheet is code, not data — installing a second npm
 * theme package is a redeploy, unlike the skin tokens `resolveStyles`
 * re-reads on every request. So each theme's CSS is loaded and flattened
 * once per name and kept for the life of the process — switching *which*
 * already-installed theme is active is still live (fiche L23): only the
 * file I/O is not repeated for a theme this process has already read.
 *
 * A **local** theme's `theme.css` breaks that assumption: fiche 73's own
 * live E2E test deploys, edits and redeploys a local theme's files while
 * `cogenta serve` keeps running, exactly the "changes mid-process" case the
 * comment above says never happens for an npm package. `invalidateThemeCss`
 * exists for exactly that gap — the module-level cache here, not a closure
 * per resolver instance, so `deployThemeFromSandbox`/`restoreThemeVersion`
 * (`theme-sandbox.ts`) can call it without holding a reference to whichever
 * resolver `runServe` happened to build, the same shape
 * `invalidateFilesystemTheme` (`theme-registry.ts`) already uses for the
 * exact same reason.
 */
export function createThemeCssResolver(
  options: ThemeCssResolverOptions,
): (themeName: string) => Promise<string | null> {
  return (themeName) => {
    const cached = themeCssCache.get(themeName)
    if (cached !== undefined) return cached
    const localThemeRoot =
      options.projectRoot === undefined ? undefined : join(options.projectRoot, 'themes', themeName)
    const promise = loadThemeCss(options, themeName, localThemeRoot)
    themeCssCache.set(themeName, promise)
    return promise
  }
}

/** Clears the cached stylesheet for one theme name — see `createThemeCssResolver`'s own doc comment. */
export function invalidateThemeCss(themeName: string): void {
  themeCssCache.delete(themeName)
}
