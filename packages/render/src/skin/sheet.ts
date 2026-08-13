import type { RenderSkinCssOptions } from './css.js'
import { renderSkinCss } from './css.js'
import type { SkinTokens } from './tokens.js'
import { validateSkin } from './validate.js'

/**
 * Hot skin swap.
 *
 * A skin change validates the tokens and rewrites one stylesheet in memory.
 * There is no compilation, no bundler, and no filesystem work on the critical
 * path — persistence, when a deployment needs it, is an injected callback that
 * runs after the new sheet is already live. That is what keeps the acceptance
 * criterion ("changing a skin triggers no build and takes under a second")
 * true by construction rather than by measurement.
 */

export interface SkinSheet {
  readonly tokens: SkinTokens
  readonly css: string
  /** Content hash of the CSS. Stable for identical tokens. */
  readonly etag: string
  /** Milliseconds spent validating and rendering. */
  readonly renderedIn: number
}

/**
 * FNV-1a, 32-bit. Deliberately not `node:crypto`: this code also runs on the
 * edge target, where the Node crypto module may not exist. The hash is a cache
 * key, never a security boundary.
 */
function hash(input: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

/** Validates a skin and renders its sheet. Throws if the skin is refused. */
export function renderSkin(input: unknown, options: RenderSkinCssOptions = {}): SkinSheet {
  const start = performance.now()
  const tokens = validateSkin(input)
  const css = renderSkinCss(tokens, options)
  return { tokens, css, etag: `"${hash(css)}"`, renderedIn: performance.now() - start }
}

export interface SkinStore {
  /** The sheet currently served. */
  current(): SkinSheet
  /**
   * Swaps the active skin. The current sheet is replaced only once the new one
   * has been validated and rendered, so a refused skin leaves the live site on
   * the previous skin instead of on no skin at all.
   */
  apply(input: unknown): SkinSheet
}

export interface SkinStoreOptions extends RenderSkinCssOptions {
  /**
   * Called after the swap, with the new sheet. Write it to disk, push it to a
   * CDN, or ignore it. Failures here are the caller's to handle: the sheet is
   * already live in memory by the time this runs.
   */
  readonly onSwap?: (sheet: SkinSheet) => void
}

export function createSkinStore(initial: unknown, options: SkinStoreOptions = {}): SkinStore {
  const cssOptions: RenderSkinCssOptions =
    options.selector === undefined ? {} : { selector: options.selector }
  let sheet = renderSkin(initial, cssOptions)

  return {
    current: () => sheet,
    apply: (input: unknown): SkinSheet => {
      const next = renderSkin(input, cssOptions)
      sheet = next
      options.onSwap?.(next)
      return next
    },
  }
}
