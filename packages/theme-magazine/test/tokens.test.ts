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

  it('prints on white newsprint in black ink', () => {
    expect(tokens.color.bg.toLowerCase()).toBe('#ffffff')
    expect(luminance(tokens.color.fg)).toBeLessThan(0.02)
  })

  it('keeps one editorial red: red well above green and blue, dark enough for a kicker, never violet', () => {
    const [r, g, b] = channels(tokens.color.accent)
    expect(r).toBeGreaterThan(g + 100)
    expect(r).toBeGreaterThan(b + 100)
    expect(b).toBeLessThan(60)
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(6)
  })

  it('keeps the neutrals neutral: muted and border carry almost no colour', () => {
    for (const hex of [tokens.color.muted, tokens.color.border, tokens.color.mutedFg]) {
      const [r, g, b] = channels(hex)
      expect(Math.max(r, g, b) - Math.min(r, g, b), hex).toBeLessThan(16)
    }
  })

  it('names Fraunces and Libre Franklin, with real system fallbacks', () => {
    expect(tokens.font.serif.startsWith("'Fraunces'")).toBe(true)
    expect(tokens.font.serif).toMatch(/serif$/)
    expect(tokens.font.sans.startsWith("'Libre Franklin'")).toBe(true)
    expect(tokens.font.sans).toMatch(/system-ui/)
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
        'Public Sans',
        'Literata',
        'Figtree',
        'Newsreader',
        'Hanken Grotesk',
      ]) {
        expect(primary).not.toBe(reserved)
      }
    }
  })

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('allows motion to be removed under prefers-reduced-motion, and keeps it short', () => {
    expect(tokens.motion.reduced).toBe(true)
    expect(Number.parseFloat(tokens.motion.duration)).toBeLessThanOrEqual(150)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })

  it('keeps corners square: the largest radius stays under a quarter of a rem', () => {
    expect(Number.parseFloat(tokens.radius.sm)).toBe(0)
    expect(Number.parseFloat(tokens.radius.lg)).toBeLessThan(0.25)
  })
})
