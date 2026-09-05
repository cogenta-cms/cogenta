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

  it('picks a deep, warm green rather than a generic "eco" bright green', () => {
    // A recorded, real assertion so a future edit that quietly swaps in a
    // saturated, high-lightness green (the generic "recycling" green) is
    // caught: this palette's green is deliberately deep and desaturated.
    const hex = tokens.color.accent.replace('#', '')
    const g = Number.parseInt(hex.slice(2, 4), 16)
    expect(g).toBeLessThan(180)
  })

  it('sets a warm, light ground rather than a cold white or grey', () => {
    const hex = tokens.color.bg.replace('#', '')
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    // A warm ivory has more red than blue; a cold white/grey does not.
    expect(r).toBeGreaterThan(b)
  })

  it('names the two Google Fonts families this theme actually loads, with a real system fallback', () => {
    expect(tokens.font.sans).toContain('Source Sans 3')
    expect(tokens.font.sans).toMatch(/sans-serif/)
    expect(tokens.font.serif).toContain('Nunito')
  })

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('allows motion to be removed under prefers-reduced-motion', () => {
    expect(tokens.motion.reduced).toBe(true)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })

  it("rounds cards generously — the brief's own 14px, not a sharp corporate corner", () => {
    const asPx = (value: string): number => Number.parseFloat(value) * 16
    expect(asPx(tokens.radius.md)).toBeCloseTo(14, 0)
    expect(asPx(tokens.radius.lg)).toBeGreaterThan(asPx(tokens.radius.md))
  })

  it('uses soft, visible shadows rather than a hairline-only elevation system', () => {
    expect(tokens.shadow.sm).toMatch(/rgba?\(/)
    expect(tokens.shadow.md).toMatch(/rgba?\(/)
  })
})
