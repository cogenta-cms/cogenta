import { describe, expect, it } from 'vitest'
import {
  oklchToRgb,
  rgbToOklch,
  rotateHue,
  withChroma,
  withLightness,
  withMinChroma,
} from '../../src/demo-art/oklch.js'
import type { ColorRGB } from '../../src/demo-art/render.js'

/**
 * `compositions.ts`'s "mesh" heroes rely on this converter to derive extra
 * hues that stay genuinely colourful — the very first pass at a mesh hero
 * mixed colours in sRGB instead and produced a muddy, desaturated blur. A
 * round-trip test is the right shape of proof here: it does not assert any
 * particular colour looks good (a human has to judge that, and did, on the
 * rendered PNGs), it asserts the maths underneath is correct enough that
 * `rotateHue`/`withChroma`/`withLightness` do what their names say.
 */

const SAMPLE_COLORS: readonly ColorRGB[] = [
  { r: 1, g: 0, b: 0 },
  { r: 0, g: 1, b: 0 },
  { r: 0, g: 0, b: 1 },
  { r: 1, g: 1, b: 1 },
  { r: 0, g: 0, b: 0 },
  { r: 0.5, g: 0.5, b: 0.5 },
  { r: 0.72, g: 0.27, b: 0.18 }, // terracotta
  { r: 0.43, g: 0.16, b: 0.85 }, // violet
  { r: 0.06, g: 0.46, b: 0.43 }, // teal
]

function closeTo(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon
}

describe('rgbToOklch / oklchToRgb', () => {
  it('round-trips real sRGB colours within a small tolerance', () => {
    for (const color of SAMPLE_COLORS) {
      const oklch = rgbToOklch(color)
      const back = oklchToRgb(oklch)
      expect(closeTo(back.r, color.r)).toBe(true)
      expect(closeTo(back.g, color.g)).toBe(true)
      expect(closeTo(back.b, color.b)).toBe(true)
    }
  })

  it('gives pure white a chroma near zero', () => {
    const oklch = rgbToOklch({ r: 1, g: 1, b: 1 })
    expect(oklch.c).toBeLessThan(0.001)
    expect(oklch.l).toBeGreaterThan(0.99)
  })

  it('gives pure black a lightness near zero', () => {
    const oklch = rgbToOklch({ r: 0, g: 0, b: 0 })
    expect(oklch.l).toBeLessThan(0.001)
  })

  it('reports hue in [0, 360)', () => {
    for (const color of SAMPLE_COLORS) {
      const { h } = rgbToOklch(color)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})

describe('rotateHue', () => {
  it('changes hue but keeps lightness and chroma (within tolerance)', () => {
    const base = { r: 0.72, g: 0.27, b: 0.18 }
    const rotated = rotateHue(base, 90)
    const before = rgbToOklch(base)
    const after = rgbToOklch(rotated)
    expect(closeTo(after.l, before.l, 0.02)).toBe(true)
    expect(closeTo(after.c, before.c, 0.02)).toBe(true)
    expect(after.h).not.toBeCloseTo(before.h, 0)
  })

  it('a full 360° rotation returns (approximately) the original colour', () => {
    const base = { r: 0.43, g: 0.16, b: 0.85 }
    const rotated = rotateHue(base, 360)
    expect(closeTo(rotated.r, base.r)).toBe(true)
    expect(closeTo(rotated.g, base.g)).toBe(true)
    expect(closeTo(rotated.b, base.b)).toBe(true)
  })

  it('wraps negative rotations into [0, 360)', () => {
    const base = { r: 0.72, g: 0.27, b: 0.18 }
    const rotated = rotateHue(base, -400)
    const rotatedEquivalent = rotateHue(base, -400 + 360)
    expect(closeTo(rotated.r, rotatedEquivalent.r, 0.001)).toBe(true)
  })
})

describe('withChroma / withMinChroma', () => {
  it('withChroma(0) desaturates to a neutral grey at the same lightness', () => {
    const base = { r: 0.72, g: 0.27, b: 0.18 }
    const grey = withChroma(base, 0)
    const oklch = rgbToOklch(grey)
    expect(oklch.c).toBeLessThan(0.005)
  })

  it('withMinChroma never reduces an already-saturated colour', () => {
    const base = { r: 0.72, g: 0.27, b: 0.18 }
    const before = rgbToOklch(base)
    const floored = withMinChroma(base, 0.01)
    const after = rgbToOklch(floored)
    expect(after.c).toBeCloseTo(before.c, 2)
  })

  it('withMinChroma raises a muted colour up to the floor', () => {
    const muted = { r: 0.6, g: 0.58, b: 0.56 } // near-grey
    const floored = withMinChroma(muted, 0.15)
    const oklch = rgbToOklch(floored)
    // Not exactly 0.15: an out-of-gamut OKLCH value is clipped back into
    // sRGB by `oklchToRgb`, which loses a hair of chroma — this asserts
    // "raised close to the floor", not bit-exact equality with it.
    expect(oklch.c).toBeGreaterThan(0.14)
  })
})

describe('withLightness', () => {
  it('nudges lightness without collapsing chroma to zero', () => {
    const base = { r: 0.43, g: 0.16, b: 0.85 }
    const lighter = withLightness(base, 0.1)
    const before = rgbToOklch(base)
    const after = rgbToOklch(lighter)
    expect(after.l).toBeGreaterThan(before.l)
    expect(after.c).toBeGreaterThan(0)
  })

  it('clamps lightness to [0, 1]', () => {
    const base = { r: 1, g: 1, b: 1 }
    const stillWhite = withLightness(base, 0.5)
    expect(stillWhite.r).toBeLessThanOrEqual(1)
    expect(stillWhite.g).toBeLessThanOrEqual(1)
    expect(stillWhite.b).toBeLessThanOrEqual(1)
  })
})
