import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { contrast, parseHex, toOklch } from './css-color.js'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and this theme's default skin is the first one that has
 * to pass. The refusal belongs to the skin validator; this asserts the
 * shipped tokens would survive it, and that they carry this theme's identity.
 */
const tokens = JSON.parse(
  readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'),
) as SkinTokens & Record<string, Record<string, unknown>>

const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  color: ['bg', 'fg', 'accent', 'accentFg', 'muted', 'mutedFg', 'border'],
  font: ['sans', 'serif', 'mono', 'scale', 'baseSize'],
  space: ['unit', 'density'],
  radius: ['sm', 'md', 'lg'],
  motion: ['duration', 'easing', 'reduced'],
  shadow: ['sm', 'md'],
}

function primary(stack: string): string {
  return stack.split(',')[0]?.replace(/['"]/g, '').trim() ?? ''
}

const oklch = (hex: string) => toOklch(parseHex(hex))

describe('the default skin', () => {
  it('declares every token group the contract fixes, and no other', () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const [group, names] of Object.entries(EXPECTED)) {
    it(`declares every token of "${group}", and no other`, () => {
      expect(Object.keys(tokens[group] ?? {}).sort()).toEqual([...names].sort())
    })
  }

  it('reaches AA contrast on every text pair the contract names', () => {
    const { fg, bg, accent, accentFg, muted, mutedFg } = tokens.color
    expect(contrast(parseHex(fg), parseHex(bg))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parseHex(accentFg), parseHex(accent))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parseHex(mutedFg), parseHex(muted))).toBeGreaterThanOrEqual(4.5)
  })

  it('grounds the page on warm paper, never a cold white or grey', () => {
    const { l, c, h } = oklch(tokens.color.bg)
    expect(l).toBeGreaterThan(0.94)
    expect(l).toBeLessThan(0.99)
    expect(c).toBeGreaterThan(0.006)
    expect(h).toBeGreaterThan(60)
    expect(h).toBeLessThan(100)
  })

  it('sets a green-black ink, never pure black', () => {
    const { l, h } = oklch(tokens.color.fg)
    expect(l).toBeGreaterThan(0.15)
    expect(l).toBeLessThan(0.3)
    expect(h).toBeGreaterThan(120)
    expect(h).toBeLessThan(180)
  })

  it('makes the organisation’s colour a deep green: never an eco lime, an indigo or a violet', () => {
    const { l, c, h } = oklch(tokens.color.accent)
    expect(h).toBeGreaterThan(140)
    expect(h).toBeLessThan(175)
    expect(l).toBeLessThan(0.5)
    expect(c).toBeLessThan(0.12)
  })

  it('holds the green as link text on the paper', () => {
    expect(contrast(parseHex(tokens.color.accent), parseHex(tokens.color.bg))).toBeGreaterThan(7)
  })

  it('names Bricolage Grotesque for display and Source Sans 3 for text, each with a real fallback', () => {
    expect(primary(tokens.font.serif)).toBe('Bricolage Grotesque')
    expect(primary(tokens.font.sans)).toBe('Source Sans 3')
    expect(tokens.font.sans).toMatch(/sans-serif$/)
    expect(tokens.font.serif).toMatch(/sans-serif$/)
    expect(tokens.font.mono).toMatch(/^ui-monospace/)
  })

  it('names none of the typefaces generated templates reach for first, nor one another theme owns', () => {
    for (const stack of [tokens.font.sans, tokens.font.serif, tokens.font.mono]) {
      for (const reserved of [
        'Inter',
        'Roboto',
        'Poppins',
        'Plus Jakarta Sans',
        'Space Grotesk',
        'DM Sans',
        'Manrope',
        'Outfit',
        'Sora',
        'Nunito',
        'Archivo',
        'Albert Sans',
        'Fraunces',
        'Libre Franklin',
        'Source Serif 4',
        'Literata',
        'Figtree',
        'Newsreader',
        'Hanken Grotesk',
        'Cormorant Garamond',
        'Karla',
        'Geist',
        'Geist Mono',
        'IBM Plex Sans',
        'IBM Plex Mono',
        'Instrument Sans',
        'Instrument Serif',
      ]) {
        expect(primary(stack)).not.toBe(reserved)
      }
    }
  })

  it('uses a typographic ratio that still increases, and a base size a reader can read', () => {
    expect(tokens.font.scale).toBeGreaterThan(1.1)
    expect(tokens.font.scale).toBeLessThanOrEqual(1.25)
    expect(Number.parseFloat(tokens.font.baseSize)).toBeGreaterThanOrEqual(1)
  })

  it('allows motion to be removed under prefers-reduced-motion, and keeps it short', () => {
    expect(tokens.motion.reduced).toBe(true)
    expect(Number.parseFloat(tokens.motion.duration)).toBeLessThanOrEqual(150)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })

  it('softens corners by a hair, never into pills or rounded cards', () => {
    for (const value of Object.values(tokens.radius)) {
      expect(Number.parseFloat(value) * 16).toBeLessThanOrEqual(6)
    }
  })
})
