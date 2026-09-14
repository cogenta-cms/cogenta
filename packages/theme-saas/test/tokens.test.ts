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

  it('sets a near-black ink on white, never pure black', () => {
    expect(luminance(tokens.color.bg)).toBeGreaterThan(0.95)
    expect(luminance(tokens.color.fg)).toBeLessThan(0.02)
    expect(tokens.color.fg).not.toBe('#000000')
  })

  it('builds the neutrals as a grey scale with no visible colour', () => {
    for (const hex of [
      tokens.color.bg,
      tokens.color.muted,
      tokens.color.border,
      tokens.color.fg,
      tokens.color.mutedFg,
    ]) {
      expect(oklch(hex).c, hex).toBeLessThan(0.02)
    }
  })

  it('orders the greys: a muted band just below white, a border below it', () => {
    expect(luminance(tokens.color.muted)).toBeLessThan(luminance(tokens.color.bg))
    expect(luminance(tokens.color.border)).toBeLessThan(luminance(tokens.color.muted))
  })

  it('keeps one accent, a clear signal blue: never an indigo or a violet', () => {
    const { l, c, h } = oklch(tokens.color.accent)
    expect(h).toBeGreaterThan(235)
    expect(h).toBeLessThan(262)
    expect(c).toBeGreaterThan(0.12)
    expect(l).toBeGreaterThan(0.45)
    expect(l).toBeLessThan(0.6)
  })

  it('holds the blue as link text on white', () => {
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('names Geist for text and Geist Mono for code and figures, each with a real system fallback', () => {
    expect(primary(tokens.font.sans)).toBe('Geist')
    expect(tokens.font.sans).toMatch(/system-ui/)
    expect(primary(tokens.font.mono)).toBe('Geist Mono')
    expect(tokens.font.mono).toMatch(/ui-monospace/)
    expect(tokens.font.serif.startsWith('ui-serif')).toBe(true)
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
        'JetBrains Mono',
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
        'Bricolage Grotesque',
        'Source Sans 3',
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

  it('softens corners by a hair, never into pills', () => {
    expect(Number.parseFloat(tokens.radius.sm)).toBeLessThanOrEqual(0.25)
    expect(Number.parseFloat(tokens.radius.md)).toBeLessThanOrEqual(0.375)
    expect(Number.parseFloat(tokens.radius.lg)).toBeLessThanOrEqual(0.5)
  })
})
