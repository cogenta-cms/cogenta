import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

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

function channels(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  ) as unknown as readonly [number, number, number]
}

function luminance(hex: string): number {
  const linear = channels(hex)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return (
    0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
  )
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return ((light as number) + 0.05) / ((dark as number) + 0.05)
}

/** Hue in degrees, from sRGB channels. */
function hue(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => channel / 255) as unknown as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return h
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
  })

  it('sets black type on white paper', () => {
    expect(luminance(tokens.color.bg)).toBeGreaterThan(0.9)
    expect(luminance(tokens.color.fg)).toBeLessThan(0.01)
  })

  it('keeps the neutrals neutral: paper, muted, border and muted type carry almost no colour', () => {
    for (const hex of [
      tokens.color.bg,
      tokens.color.muted,
      tokens.color.border,
      tokens.color.mutedFg,
    ]) {
      const [r, g, b] = channels(hex)
      expect(Math.max(r, g, b) - Math.min(r, g, b), hex).toBeLessThan(8)
    }
  })

  it('keeps one signal colour, an orange: never an indigo or a violet', () => {
    const h = hue(tokens.color.accent)
    expect(h).toBeGreaterThanOrEqual(10)
    expect(h).toBeLessThanOrEqual(45)
    const [r, , b] = channels(tokens.color.accent)
    expect(r).toBeGreaterThan(200)
    expect(b).toBeLessThan(60)
  })

  it('holds the signal as a graphic on both paper and black, at least 3:1 either way', () => {
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(3)
    expect(contrast(tokens.color.accent, '#000000')).toBeGreaterThanOrEqual(3)
  })

  it('names Archivo first, with a real system fallback, and no second display face', () => {
    expect(tokens.font.sans.startsWith("'Archivo'")).toBe(true)
    expect(tokens.font.sans).toMatch(/system-ui/)
    expect(tokens.font.serif.startsWith('ui-serif')).toBe(true)
    expect(tokens.font.mono.startsWith('ui-monospace')).toBe(true)
  })

  it('names none of the typefaces generated templates reach for first, nor one another theme owns', () => {
    for (const stack of [tokens.font.sans, tokens.font.serif, tokens.font.mono]) {
      const primary = stack.split(',')[0]?.replace(/['"]/g, '').trim()
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
        'Bricolage Grotesque',
        'JetBrains Mono',
        'Fraunces',
        'Libre Franklin',
        'Source Serif 4',
        'Literata',
        'Figtree',
        'Newsreader',
        'Hanken Grotesk',
        'Albert Sans',
        'Geist',
        'IBM Plex Sans',
        'Instrument Sans',
      ]) {
        expect(primary).not.toBe(reserved)
      }
    }
  })

  it('uses a typographic scale that increases', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('allows motion to be removed under prefers-reduced-motion, and keeps it short', () => {
    expect(tokens.motion.reduced).toBe(true)
    expect(Number.parseFloat(tokens.motion.duration)).toBeLessThanOrEqual(150)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })

  it('keeps corners square: no radius on anything a visitor sees', () => {
    expect(Number.parseFloat(tokens.radius.sm)).toBe(0)
    expect(Number.parseFloat(tokens.radius.md)).toBe(0)
    expect(Number.parseFloat(tokens.radius.lg)).toBeLessThan(0.25)
  })
})
