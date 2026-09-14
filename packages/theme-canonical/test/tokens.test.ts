import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SkinTokens } from '../src/theme-contract.js'

/**
 * Contract D fixes a **closed and complete** token set: a skin that omits a
 * token is refused, and the theme's default skin is the first one that has to
 * pass. The refusal itself belongs to the skin validator (L3, task 6); this
 * asserts the shipped tokens would survive it.
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

  it('uses a typographic scale that increases monotonically', () => {
    expect(tokens.font.scale).toBeGreaterThan(1)
  })

  it('allows motion to be removed under prefers-reduced-motion', () => {
    expect(tokens.motion.reduced).toBe(true)
  })

  it('uses a density the contract allows', () => {
    expect(['compact', 'comfortable', 'spacious']).toContain(tokens.space.density)
  })
})

/** The first family of a CSS font stack, unquoted. */
function primary(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '')
  const channel = (offset: number): number => Number.parseInt(value.slice(offset, offset + 2), 16)
  return [channel(0), channel(2), channel(4)]
}

describe('the default skin’s identity (L27)', () => {
  it('names Instrument Sans for text and Instrument Serif for display, each with a real system fallback', () => {
    expect(primary(tokens.font.sans)).toBe('Instrument Sans')
    expect(primary(tokens.font.serif)).toBe('Instrument Serif')
    expect(tokens.font.sans).toMatch(/sans-serif$/)
    expect(tokens.font.serif).toMatch(/serif$/)
    expect(tokens.font.mono).toMatch(/^ui-monospace/)
  })

  it('names none of the typefaces generated templates reach for first, nor one another theme owns', () => {
    for (const stack of [tokens.font.sans, tokens.font.serif, tokens.font.mono]) {
      for (const reserved of [
        'Inter',
        'Roboto',
        'Poppins',
        'Plus Jakarta Sans',
        'Space Grotesk',
        'DM Sans',
        'Manrope',
        'Outfit',
        'Sora',
        'Nunito',
        'Archivo',
        'Albert Sans',
        'Fraunces',
        'Libre Franklin',
        'Source Serif 4',
        'Source Sans 3',
        'Literata',
        'Figtree',
        'Newsreader',
        'Hanken Grotesk',
        'Cormorant Garamond',
        'Karla',
        'Geist',
        'Geist Mono',
        'IBM Plex Sans',
        'IBM Plex Mono',
        'Bricolage Grotesque',
      ]) {
        expect(primary(stack)).not.toBe(reserved)
      }
    }
  })

  it('grounds the page in pure neutrals: white, a grey band, a near-black ink', () => {
    for (const name of ['bg', 'fg', 'muted', 'mutedFg', 'border'] as const) {
      const [r, g, b] = hexToRgb(tokens.color[name])
      expect(Math.max(r, g, b) - Math.min(r, g, b), name).toBeLessThanOrEqual(2)
    }
    expect(hexToRgb(tokens.color.bg)).toEqual([255, 255, 255])
    expect(Math.max(...hexToRgb(tokens.color.fg))).toBeLessThan(0x20)
  })

  it('keeps one accent, a deep blue and never a violet, dark enough to be link text on white', () => {
    const [r, g, b] = hexToRgb(tokens.color.accent)
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
    // A violet puts red within reach of blue; this blue keeps red well below green.
    expect(r).toBeLessThan(g)
    expect(contrast(tokens.color.accent, tokens.color.bg)).toBeGreaterThan(7)
  })

  it('softens corners by a hair, never into pills or rounded cards', () => {
    for (const value of Object.values(tokens.radius)) {
      expect(Number.parseFloat(value) * 16).toBeLessThanOrEqual(4)
    }
  })

  it('keeps motion short', () => {
    expect(Number.parseFloat(tokens.motion.duration)).toBeLessThanOrEqual(150)
  })

  it('sets text at a size a reader reads without zooming, on a scale that stays calm', () => {
    expect(Number.parseFloat(tokens.font.baseSize)).toBeGreaterThanOrEqual(1)
    expect(tokens.font.scale).toBeLessThanOrEqual(1.25)
  })
})
