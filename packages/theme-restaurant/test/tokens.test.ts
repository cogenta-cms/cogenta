import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { parseHex, toOklch } from './css-color.js'

/**
 * Contract D fixes a closed and complete token set: a skin that omits a token
 * is refused, and this theme's default skin is the first one that has to pass.
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

function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const linear = [r, g, b].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return (
    0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
  )
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return ((light as number) + 0.05) / ((dark as number) + 0.05)
}

const oklch = (hex: string) => toOklch(parseHex(hex))

function primary(stack: string): string {
  return stack.split(',')[0]?.replace(/['"]/g, '').trim() ?? ''
}

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
    expect(contrast(tokens.color.fg, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.color.accentFg, tokens.color.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.color.mutedFg, tokens.color.muted)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.color.mutedFg, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('sets a deep charcoal ink on a warm cream paper, never pure black on pure white', () => {
    expect(luminance(tokens.color.bg)).toBeGreaterThan(0.8)
    expect(luminance(tokens.color.bg)).toBeLessThan(0.95)
    expect(luminance(tokens.color.fg)).toBeLessThan(0.03)
    expect(tokens.color.fg).not.toBe('#000000')
    expect(tokens.color.bg).not.toBe('#ffffff')
  })

  it('keeps the neutrals warm and nearly without colour', () => {
    for (const hex of [tokens.color.bg, tokens.color.muted, tokens.color.border, tokens.color.fg]) {
      const { c, h } = oklch(hex)
      expect(c, hex).toBeLessThan(0.03)
      expect(h, hex).toBeGreaterThan(40)
      expect(h, hex).toBeLessThan(100)
    }
  })

  it('keeps one accent, a brass: never an indigo, a violet or a wine red', () => {
    const { l, c, h } = oklch(tokens.color.accent)
    expect(h).toBeGreaterThan(60)
    expect(h).toBeLessThan(100)
    expect(c).toBeGreaterThan(0.06)
    expect(c).toBeLessThan(0.16)
    expect(l).toBeLessThan(0.6)
  })

  it('holds the brass as text on the cream paper, since it names the parts of the menu', () => {
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('names Cormorant Garamond for display and Karla for text, each with a real system fallback', () => {
    expect(primary(tokens.font.serif)).toBe('Cormorant Garamond')
    expect(tokens.font.serif).toMatch(/Georgia/)
    expect(primary(tokens.font.sans)).toBe('Karla')
    expect(tokens.font.sans).toMatch(/system-ui/)
    expect(tokens.font.mono.startsWith('ui-monospace')).toBe(true)
  })

  it('names none of the typefaces generated templates reach for first, nor one another theme owns', () => {
    for (const stack of [tokens.font.sans, tokens.font.serif, tokens.font.mono]) {
      for (const reserved of [
        'Inter',
        'Inter Tight',
        'Roboto',
        'Poppins',
        'Plus Jakarta Sans',
        'Space Grotesk',
        'DM Sans',
        'Manrope',
        'Outfit',
        'Sora',
        'Nunito',
        'Jost',
        'Archivo',
        'Albert Sans',
        'Fraunces',
        'Libre Franklin',
        'Source Serif 4',
        'Literata',
        'Figtree',
        'Newsreader',
        'Hanken Grotesk',
        'Geist',
        'Bricolage Grotesque',
        'Source Sans 3',
        'IBM Plex Sans',
        'Instrument Sans',
        'Instrument Serif',
      ]) {
        expect(primary(stack)).not.toBe(reserved)
      }
    }
  })

  it('uses a typographic ratio that still increases, and a base size a guest can read', () => {
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

  it('keeps corners square, softened at most by a hair', () => {
    expect(Number.parseFloat(tokens.radius.sm)).toBe(0)
    expect(Number.parseFloat(tokens.radius.md)).toBe(0)
    expect(Number.parseFloat(tokens.radius.lg)).toBeLessThanOrEqual(0.125)
  })
})
