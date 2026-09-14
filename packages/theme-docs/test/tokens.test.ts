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

  it('picks a deep teal accent, never an indigo or a violet', () => {
    // Teal sits between green and blue: blue and green both well above red,
    // and blue never far above green (which is where indigo and violet start).
    const hex = tokens.color.accent.replace('#', '')
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    expect(g).toBeGreaterThan(r + 40)
    expect(b).toBeGreaterThan(r + 40)
    expect(b - g).toBeLessThan(40)
  })

  it('keeps links in the accent readable on white and on the grey of a band', () => {
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.color.accent, tokens.color.muted)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.color.mutedFg, tokens.color.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('names Google Fonts families this theme actually loads, with a real system fallback', () => {
    expect(tokens.font.sans).toContain('IBM Plex Sans')
    expect(tokens.font.sans).toMatch(/system-ui/)
    expect(tokens.font.mono).toContain('IBM Plex Mono')
    expect(tokens.font.mono).toMatch(/monospace/)
  })

  it('names IBM Plex Sans first — the family actually requested, not just present in the fallback chain', () => {
    const primary = tokens.font.sans.split(',')[0]?.replace(/['"]/g, '').trim()
    expect(primary).toBe('IBM Plex Sans')
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

  it('picks a comfortable density: the theme sets its own tighter rhythm inside an article', () => {
    expect(tokens.space.density).toBe('comfortable')
  })

  it('keeps radii to a hair: a reference reads as structured, not soft', () => {
    const asRem = (value: string): number => Number.parseFloat(value)
    expect(asRem(tokens.radius.lg)).toBeLessThanOrEqual(0.375)
    expect(asRem(tokens.radius.sm)).toBeLessThanOrEqual(asRem(tokens.radius.md))
  })

  it('names IBM Plex Mono first for code', () => {
    expect(tokens.font.mono.split(',')[0]?.replace(/['"]/g, '').trim()).toBe('IBM Plex Mono')
  })
})
