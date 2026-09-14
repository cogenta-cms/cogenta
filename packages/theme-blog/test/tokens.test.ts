import { readFileSync } from 'node:fs'
import type { SkinTokens } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and this theme's default skin is the first one that has
 * to pass.
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

  it('picks one ink-blue accent: blue over red and green, dark enough for links, never violet', () => {
    const hex = tokens.color.accent.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    expect(b as number).toBeGreaterThan(r as number)
    expect(b as number).toBeGreaterThan(g as number)
    // A violet reads as the default of a generated template: red never climbs
    // to meet blue.
    expect((b as number) - (r as number)).toBeGreaterThan(50)
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(7)
  })

  it('names the Google Fonts families this theme loads, with a real system fallback', () => {
    expect(tokens.font.serif.startsWith("'Literata'")).toBe(true)
    expect(tokens.font.serif).toMatch(/serif$/)
    expect(tokens.font.sans.startsWith("'Figtree'")).toBe(true)
    expect(tokens.font.sans).toMatch(/system-ui/)
    const theme = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8')
    expect(theme).toContain('family=Literata:ital,opsz,wght@')
    expect(theme).toContain('family=Figtree:')
  })

  it('names none of the typefaces generated templates reach for first', () => {
    for (const stack of [tokens.font.sans, tokens.font.serif, tokens.font.mono]) {
      const primary = stack.split(',')[0]?.replace(/['"]/g, '').trim()
      for (const overused of [
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
      ]) {
        expect(primary).not.toBe(overused)
      }
    }
  })

  it('keeps two families and a system monospace, never a third web font', () => {
    expect(tokens.font.mono.startsWith('ui-monospace')).toBe(true)
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

  it('keeps corners barely softened: the largest radius stays under a third of a rem', () => {
    expect(Number.parseFloat(tokens.radius.lg)).toBeLessThan(0.33)
  })

  it('reads as a warm, paper-light ground rather than a stark white', () => {
    // bg is warm off-white: red channel strictly greater than blue.
    const r = Number.parseInt(tokens.color.bg.slice(1, 3), 16)
    const b = Number.parseInt(tokens.color.bg.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })
})
