import { describe, expect, it } from 'vitest'
import {
  findWebFont,
  primaryFamily,
  renderSkinCss,
  validateSkin,
  WEB_FONTS,
  webFontImports,
} from '../../src/skin/index.js'
import { VALID_SKIN } from './fixtures.js'

/**
 * L29 D1: a typeface a skin names is a typeface the page loads. Before, a
 * personalisation that chose Playfair Display rendered in Georgia, because
 * nothing ever fetched the family its stack led with.
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

describe('webFontImports', () => {
  it('imports the catalogue families a skin leads with, once each', () => {
    const imports = webFontImports({
      ...VALID_SKIN.font,
      sans: "'Inter', system-ui, sans-serif",
      serif: "'Playfair Display', Georgia, serif",
      mono: "'Inter', monospace",
    })
    expect(imports).toHaveLength(2)
    expect(imports[0]).toContain('family=Inter:')
    expect(imports[1]).toContain('family=Playfair+Display:')
  })

  it('adds nothing for a system stack or a family outside the catalogue', () => {
    expect(
      webFontImports({
        ...VALID_SKIN.font,
        sans: 'ui-sans-serif, system-ui',
        serif: "'My Brand Serif', serif",
        mono: 'ui-monospace, monospace',
      }),
    ).toEqual([])
  })
})

describe('the skin sheet', () => {
  it('opens with the imports, before any rule, where a browser still honours them', () => {
    const tokens = validateSkin({
      ...VALID_SKIN,
      font: { ...VALID_SKIN.font, serif: "'DM Serif Display', Georgia, serif" },
    })
    const css = renderSkinCss(tokens)
    expect(
      css.startsWith('@import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:'),
    ).toBe(true)
    expect(css.indexOf('@import')).toBeLessThan(css.indexOf('{'))
  })
})
