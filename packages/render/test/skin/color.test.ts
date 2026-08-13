import { describe, expect, it } from 'vitest'
import {
  compositeOver,
  contrastRatio,
  meetsContrastAa,
  parseColor,
  relativeLuminance,
} from '../../src/skin/index.js'
import { BOUNDARY } from './fixtures.js'

function rgb(value: string): { r: number; g: number; b: number } {
  const parsed = parseColor(value)
  if (parsed === null) {
    throw new Error(`fixture colour ${value} does not parse`)
  }
  return parsed
}

describe('colour parsing', () => {
  it('reads the four hex forms, expanding shorthand digits', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#0000')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.502, 3)
  })

  it('reads both the comma and the slash syntax of rgb()', () => {
    expect(parseColor('rgb(18, 24, 32)')).toEqual({ r: 18, g: 24, b: 32, a: 1 })
    expect(parseColor('rgb(18 24 32 / 0.5)')).toEqual({ r: 18, g: 24, b: 32, a: 0.5 })
    expect(parseColor('rgba(18, 24, 32, 50%)')?.a).toBeCloseTo(0.5, 5)
  })

  it('converts hsl() to the same colour a browser would paint', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    const teal = parseColor('hsl(180deg 100% 25%)')
    expect(teal?.r).toBeCloseTo(0, 5)
    expect(teal?.g).toBeCloseTo(127.5, 5)
  })

  it('refuses a colour whose luminance cannot be computed', () => {
    // Refused rather than guessed: an unmeasurable colour cannot be validated,
    // and a colour that cannot be validated must not enter a skin.
    expect(parseColor('rebeccapurple')).toBeNull()
    expect(parseColor('oklch(0.7 0.1 200)')).toBeNull()
    expect(parseColor('#ff')).toBeNull()
    expect(parseColor('rgb(1, 2)')).toBeNull()
  })
})

describe('WCAG luminance and contrast', () => {
  it('matches the reference luminance of the extremes', () => {
    expect(relativeLuminance(rgb('#000000'))).toBe(0)
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 10)
  })

  it('rates black on white at the maximum ratio of 21', () => {
    expect(contrastRatio(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(21, 10)
  })

  it('is symmetric: swapping foreground and background changes nothing', () => {
    const a = contrastRatio(rgb('#1d4ed8'), rgb('#ffffff'))
    const b = contrastRatio(rgb('#ffffff'), rgb('#1d4ed8'))
    expect(a).toBeCloseTo(b, 12)
  })

  it('passes a pair sitting exactly on the 4.5:1 floor and fails one at 4.4:1', () => {
    const exact = contrastRatio(rgb(BOUNDARY.exactlyAa), rgb(BOUNDARY.white))
    const under = contrastRatio(rgb(BOUNDARY.justUnderAa), rgb(BOUNDARY.white))

    expect(exact).toBeGreaterThanOrEqual(4.5)
    expect(exact).toBeLessThan(4.51)
    expect(under).toBeGreaterThan(4.4)
    expect(under).toBeLessThan(4.5)

    expect(meetsContrastAa(exact, 'normal')).toBe(true)
    expect(meetsContrastAa(under, 'normal')).toBe(false)
  })

  it('applies the 3:1 floor to large text only', () => {
    const ratio = contrastRatio(rgb(BOUNDARY.largeTextOnly), rgb(BOUNDARY.white))
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(ratio).toBeLessThan(3.01)
    expect(meetsContrastAa(ratio, 'large')).toBe(true)
    expect(meetsContrastAa(ratio, 'normal')).toBe(false)
  })

  it('composites a translucent foreground before measuring it', () => {
    const half = parseColor('rgb(0 0 0 / 0.5)')
    if (half === null) {
      throw new Error('fixture does not parse')
    }
    const composited = compositeOver(half, rgb('#ffffff'))
    expect(composited).toEqual({ r: 127.5, g: 127.5, b: 127.5 })

    // Measuring the raw colour would claim 21:1 for what a visitor sees at 3.95:1.
    const honest = contrastRatio(composited, rgb('#ffffff'))
    expect(honest).toBeLessThan(4.5)
  })
})
