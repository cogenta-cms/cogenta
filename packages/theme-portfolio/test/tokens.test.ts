import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and the theme's default skin is the first one that has to
 * pass. The refusal itself belongs to the skin validator; this asserts the
 * shipped tokens would survive it.
 *
 * Reading the file rather than importing it is deliberate: `tokens.json` is
 * data served at runtime and rewritten on a skin change, not a module compiled
 * into the theme.
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

/** WCAG 2.x relative luminance, on sRGB. */
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

  it('picks an accent that is not a generic default blue', () => {
    // The brief calls for "one confident, slightly unusual accent colour" —
    // this is a guard against ever reverting to a template default, not a
    // claim any tool can fully verify. #1d4ed8 is `theme-canonical`'s own.
    expect(tokens.color.accent.toLowerCase()).not.toBe('#1d4ed8')
    expect(tokens.color.accent.toLowerCase()).not.toBe('#0000ff')
  })

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('picks a distinctive display face, not one of the overused defaults', () => {
    const forbidden = ['inter', 'roboto', 'space grotesk']
    const sans = tokens.font.sans.toLowerCase()
    for (const name of forbidden) {
      expect(sans).not.toContain(name)
    }
  })

  it('gives every chosen face a real system fallback stack', () => {
    expect(tokens.font.sans).toMatch(/sans-serif/)
    expect(tokens.font.serif).toMatch(/serif/)
    expect(tokens.font.mono).toMatch(/monospace/)
  })

  it('allows motion to be removed under prefers-reduced-motion', () => {
    expect(tokens.motion.reduced).toBe(true)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })
})
