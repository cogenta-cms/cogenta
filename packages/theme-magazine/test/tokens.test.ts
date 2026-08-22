import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and this theme's default skin is the first one that has
 * to pass. Reading the file rather than importing it is deliberate:
 * `tokens.json` is data served at runtime and rewritten on a skin change,
 * not a module compiled into the theme.
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

  it('does not use pure white or pure black for the paper/ink pair', () => {
    // A print theme's whole identity is a warm, off-white page — a literal
    // `#ffffff` here would be the one regression that quietly turns it into
    // a generic light theme.
    expect(tokens.color.bg.toLowerCase()).not.toBe('#ffffff')
    expect(tokens.color.fg.toLowerCase()).not.toBe('#000000')
  })

  it('picks an accent that is not the generic default blue', () => {
    expect(tokens.color.accent.toLowerCase()).not.toBe('#1d4ed8')
  })

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('names a distinctive display serif with a real system fallback', () => {
    expect(tokens.font.serif).toContain('Fraunces')
    expect(tokens.font.serif.toLowerCase()).toContain('georgia')
  })

  it('names a quiet sans with a real system fallback', () => {
    expect(tokens.font.sans).toContain('Public Sans')
    expect(tokens.font.sans.toLowerCase()).toMatch(/system-ui|segoe/)
  })

  it('allows motion to be removed under prefers-reduced-motion', () => {
    expect(tokens.motion.reduced).toBe(true)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })

  it('keeps radii small, in keeping with a print page rather than a rounded UI', () => {
    const parse = (value: string): number => Number.parseFloat(value)
    expect(parse(tokens.radius.lg)).toBeLessThanOrEqual(0.5)
  })
})
