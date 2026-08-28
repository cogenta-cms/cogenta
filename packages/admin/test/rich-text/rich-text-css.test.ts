import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Fiche 42 task 1: the editing surface had no `min-height` outside fullscreen
 * — it measured exactly one line and grew only with content, which read as
 * "the editor is broken" on a fresh entry. jsdom (this suite's DOM) never
 * applies an external stylesheet's cascade, so a computed-style assertion on
 * a rendered `RichTextEditor` would prove nothing; reading the real rule is
 * the honest regression test for a bug that was, in the end, a missing CSS
 * declaration.
 *
 * Resolved from `process.cwd()` (this package's root, however the test
 * runner is invoked — `pnpm -F @cogenta/admin test` or via turbo), not
 * `import.meta.url`: under this suite's `jsdom` environment specifically,
 * Vitest does not hand a module a real `file:` URL.
 */
const CSS_PATH = resolve(process.cwd(), 'src/styles/rich-text.css')
const CSS = readFileSync(CSS_PATH, 'utf8')

describe('rich-text.css — editing surface height (fiche 42 task 1)', () => {
  it('gives `.rich-text-editor__surface` its own `min-height`, not only under `--fullscreen`', () => {
    // Isolate the rule block that applies to the bare class (no combinator
    // in front of the selector) — this is what a normal, non-fullscreen
    // render actually matches. Allows a `/* … */` doc comment (there is one,
    // right above the real rule) between the previous `}` and the selector.
    const match = /(?:^|\})(?:\s|\/\*[\s\S]*?\*\/)*\.rich-text-editor__surface\s*\{([^}]*)\}/.exec(
      CSS,
    )
    expect(match, 'expected a standalone `.rich-text-editor__surface { … }` rule').not.toBeNull()
    expect(match?.[1]).toMatch(/min-height\s*:\s*\S+/)
  })

  it('still keeps the taller fullscreen override, unregressed by the fix', () => {
    expect(CSS).toContain('.rich-text-editor--fullscreen .rich-text-editor__surface')
    expect(CSS).toMatch(
      /\.rich-text-editor--fullscreen \.rich-text-editor__surface\s*\{[^}]*min-height\s*:\s*calc\(100vh - 8rem\)/,
    )
  })
})
