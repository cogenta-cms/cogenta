import { describe, expect, it } from 'vitest'
import {
  availableWebFonts,
  findWebFont,
  isSelfHostedFamily,
  primaryFamily,
  renderSkinCss,
  SELF_HOSTED_FAMILIES,
  validateSkin,
  WEB_FONTS,
  webFontImports,
} from '../../src/skin/index.js'
import { VALID_SKIN } from './fixtures.js'

/**
 * L29 D1: a typeface a skin names is a typeface the page loads. Before, a
 * personalisation that chose Playfair Display rendered in Georgia, because
 * nothing ever fetched the family its stack led with.
 *
 * Since the privacy fix, "loads" means one of two things and never a silent
 * third: a bundled family is served by the site itself, and any other
 * catalogue family is requested from Google Fonts only when the site owner
 * turned `appearance.remoteWebFonts` on. A default sheet makes no request.
 */

describe('primaryFamily', () => {
  it('reads the first family of a stack, without its quotes', () => {
    expect(primaryFamily("'Playfair Display', Georgia, serif")).toBe('Playfair Display')
    expect(primaryFamily('"Source Serif 4",serif')).toBe('Source Serif 4')
    expect(primaryFamily('ui-sans-serif, system-ui')).toBe('ui-sans-serif')
  })
})

describe('the web font catalogue', () => {
  it('holds each family once, and only well-formed css2 axis requests', () => {
    const names = WEB_FONTS.map((font) => font.family.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const font of WEB_FONTS) {
      expect(font.axes).toMatch(/^[a-z,]+@[0-9.,;]+$/u)
    }
  })

  it('finds a family whatever its case', () => {
    expect(findWebFont('playfair display')?.family).toBe('Playfair Display')
    expect(findWebFont('Comic Sans MS')).toBeUndefined()
  })
})

describe('the bundled families', () => {
  it('are all catalogue families, listed once and sorted', () => {
    for (const family of SELF_HOSTED_FAMILIES) expect(findWebFont(family), family).toBeDefined()
    expect(new Set(SELF_HOSTED_FAMILIES).size).toBe(SELF_HOSTED_FAMILIES.length)
    expect([...SELF_HOSTED_FAMILIES].sort()).toEqual([...SELF_HOSTED_FAMILIES])
  })

  it('are all a skin can be offered while remote web fonts are off', () => {
    const offered = availableWebFonts(false).map((font) => font.family)
    expect(offered.sort()).toEqual([...SELF_HOSTED_FAMILIES].sort())
    expect(availableWebFonts(true)).toHaveLength(WEB_FONTS.length)
    expect(isSelfHostedFamily(' geist mono ')).toBe(true)
    expect(isSelfHostedFamily('Playfair Display')).toBe(false)
  })

  it('cover every role, so a generated skin can still pair a serif, a sans and a mono', () => {
    for (const role of ['serif', 'sans', 'mono'] as const) {
      expect(
        availableWebFonts(false).some((font) => font.role === role),
        role,
      ).toBe(true)
    }
  })
})

describe('webFontImports', () => {
  const stacks = {
    ...VALID_SKIN.font,
    sans: "'Inter', system-ui, sans-serif",
    serif: "'Playfair Display', Georgia, serif",
    mono: "'Inter', monospace",
  }

  it('requests nothing by default: a visitor address is not sent to a font provider', () => {
    expect(webFontImports(stacks)).toEqual([])
    expect(webFontImports(stacks, {})).toEqual([])
    expect(webFontImports(stacks, { remote: false })).toEqual([])
  })

  it('imports the catalogue families a skin leads with, once each, when remote is on', () => {
    const imports = webFontImports(stacks, { remote: true })
    expect(imports).toHaveLength(2)
    expect(imports[0]).toContain('family=Inter:')
    expect(imports[1]).toContain('family=Playfair+Display:')
  })

  it('never fetches a bundled family remotely, even when remote is on', () => {
    expect(
      webFontImports(
        { ...stacks, sans: "'Geist', sans-serif", serif: "'Fraunces', serif", mono: 'monospace' },
        { remote: true },
      ),
    ).toEqual([])
  })

  it('adds nothing for a system stack or a family outside the catalogue', () => {
    expect(
      webFontImports(
        {
          ...VALID_SKIN.font,
          sans: 'ui-sans-serif, system-ui',
          serif: "'My Brand Serif', serif",
          mono: 'ui-monospace, monospace',
        },
        { remote: true },
      ),
    ).toEqual([])
  })
})

describe('the skin sheet', () => {
  const tokens = validateSkin({
    ...VALID_SKIN,
    font: { ...VALID_SKIN.font, serif: "'DM Serif Display', Georgia, serif" },
  })

  it('contains no remote font reference by default', () => {
    const css = renderSkinCss(tokens)
    expect(css).not.toMatch(/@import|googleapis|gstatic/u)
    expect(css).toContain("'DM Serif Display', Georgia, serif")
  })

  it('opens with the imports, before any rule, where a browser still honours them, when remote is on', () => {
    const css = renderSkinCss(tokens, { remoteWebFonts: true })
    expect(
      css.startsWith('@import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:'),
    ).toBe(true)
    expect(css.indexOf('@import')).toBeLessThan(css.indexOf('{'))
  })
})
