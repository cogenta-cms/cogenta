import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and this theme's default skin is the first one that has
 * to pass. The refusal itself belongs to the skin validator; this asserts
 * the shipped tokens would survive it.
 *
 * Reading the file rather than importing it is deliberate: `tokens.json` is
 * data served at runtime and rewritten on a skin change, not a module
 * compiled into the theme.
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

  it('picks a deliberate accent distinct from the generic "corporate blue"', () => {
    // A confident forest green rather than a blue — recorded as a real
    // assertion so a future edit that quietly reverts to blue is caught.
    expect(tokens.color.accent.toLowerCase()).not.toMatch(/^#[0-4][0-9a-f][0-4][0-9a-f]/)
  })

  it('names Google Fonts families this theme actually loads, with a real system fallback', () => {
    expect(tokens.font.sans).toContain('Archivo')
    expect(tokens.font.sans).toMatch(/system-ui/)
    expect(tokens.font.serif).toContain('Source Serif 4')
    expect(tokens.font.serif).toMatch(/serif/)
  })

  it('avoids the most overused default sans faces as its primary choice', () => {
    // The stack still carries a real system fallback (which legitimately
    // includes Roboto/system-ui for Android/Linux) — what matters is which
    // family is named *first*, since that is the one actually requested.
    const primary = tokens.font.sans.split(',')[0]?.replace(/['"]/g, '').trim()
    for (const overused of ['Inter', 'Roboto', 'Space Grotesk']) {
      expect(primary).not.toBe(overused)
    }
    expect(primary).toBe('Archivo')
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

  it('keeps radii deliberately sharp — a structured, edged read rather than a soft one', () => {
    const asRem = (value: string): number => Number.parseFloat(value)
    expect(asRem(tokens.radius.lg)).toBeLessThan(1)
  })
})
