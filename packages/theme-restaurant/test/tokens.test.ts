import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and this theme's default skin is the first one that has
 * to pass. The refusal itself belongs to the skin validator; this asserts
 * the shipped tokens would survive it.
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
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  )
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return (
    0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
  )
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  const [light, dark] = a > b ? [a, b] : [b, a]
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

  it('picks a warm cream ground, not a stark white', () => {
    // The brief's own design decision: the light scheme is a warm cream,
    // not a neutral or blue-leaning white.
    const [r, g, b] = [0, 2, 4].map((offset) =>
      Number.parseInt(tokens.color.bg.replace('#', '').slice(offset, offset + 2), 16),
    )
    expect(r).toBeGreaterThan(b as number)
    expect(g).toBeGreaterThan(b as number)
  })

  it('picks a deliberate copper/wine accent, not a generic corporate blue', () => {
    const hex = tokens.color.accent.toLowerCase()
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('names Google Fonts families this theme actually loads, with a real system fallback', () => {
    expect(tokens.font.serif).toContain('Cormorant Garamond')
    expect(tokens.font.serif).toMatch(/serif/)
    expect(tokens.font.sans).toContain('Jost')
    expect(tokens.font.sans).toMatch(/system-ui/)
  })

  it('names the display serif first in its own stack', () => {
    const primary = tokens.font.serif.split(',')[0]?.replace(/['"]/g, '').trim()
    expect(primary).toBe('Cormorant Garamond')
  })

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('allows motion to be removed under prefers-reduced-motion', () => {
    expect(tokens.motion.reduced).toBe(true)
  })

  it('uses a spacious density — the "room to breathe" of an elegant dining room', () => {
    expect(tokens.space.density).toBe('spacious')
  })

  it('keeps radii close to square — hairlines carry the structure, not rounded corners', () => {
    const asRem = (value: string): number => Number.parseFloat(value)
    expect(asRem(tokens.radius.lg)).toBeLessThan(0.5)
  })
})
