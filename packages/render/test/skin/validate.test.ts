import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { computeTypeScale, validateSkin } from '../../src/skin/index.js'
import { BOUNDARY, skin, VALID_SKIN } from './fixtures.js'

function refusal(input: unknown): CogentaError {
  try {
    validateSkin(input)
  } catch (error) {
    if (error instanceof CogentaError) {
      return error
    }
    throw error
  }
  throw new Error('expected the skin to be refused, but it was accepted')
}

describe('accepting a skin', () => {
  it('accepts a complete skin and returns it typed', () => {
    expect(validateSkin(VALID_SKIN)).toEqual(VALID_SKIN)
  })

  it('accepts a pair sitting exactly on the 4.5:1 floor', () => {
    const input = skin()
    input.color.fg = BOUNDARY.exactlyAa
    input.color.bg = BOUNDARY.white
    expect(() => validateSkin(input)).not.toThrow()
  })

  it('accepts a translucent foreground that still reads over its background', () => {
    const input = skin()
    input.color.fg = 'rgb(0 0 0 / 0.9)'
    expect(() => validateSkin(input)).not.toThrow()
  })
})

describe('refusing an incomplete skin', () => {
  it('names every missing token rather than only the first', () => {
    const input = skin()
    input.color.border = undefined
    input.radius.lg = undefined
    const error = refusal(input)

    expect(error.code).toBe('SKIN_TOKEN_MISSING')
    expect(error.message).toContain('color.border')
    expect(error.message).toContain('radius.lg')
    expect(error.details?.tokens).toEqual(['color.border', 'radius.lg'])
  })

  it('reports a whole missing group token by token', () => {
    const input: Record<string, unknown> = skin()
    delete input.shadow
    const error = refusal(input)

    expect(error.code).toBe('SKIN_TOKEN_MISSING')
    expect(error.message).toContain('shadow.sm')
    expect(error.message).toContain('shadow.md')
  })

  it('refuses a token the contract does not define, because the set is closed', () => {
    const input = skin()
    input.color.brandGradient = 'linear-gradient(red, blue)'
    const error = refusal(input)

    expect(error.code).toBe('SKIN_TOKEN_UNKNOWN')
    expect(error.message).toContain('color.brandGradient')
  })

  it('refuses input that is not an object at all', () => {
    expect(refusal('a skin').code).toBe('SKIN_TOKEN_INVALID')
    expect(refusal(null).code).toBe('SKIN_TOKEN_INVALID')
  })
})

describe('refusing a malformed value', () => {
  it('refuses a colour it cannot measure', () => {
    const input = skin()
    input.color.accent = 'rebeccapurple'
    const error = refusal(input)

    expect(error.code).toBe('SKIN_TOKEN_INVALID')
    expect(error.message).toContain('color.accent')
  })

  it('refuses a translucent background, whose contrast is unmeasurable', () => {
    const input = skin()
    input.color.bg = 'rgb(255 255 255 / 0.4)'
    expect(refusal(input).message).toContain('fully opaque')
  })

  it('refuses a length or duration without a unit', () => {
    const noUnit = skin()
    noUnit.space.unit = '4'
    expect(refusal(noUnit).message).toContain('space.unit')

    const noDuration = skin()
    noDuration.motion.duration = '200'
    expect(refusal(noDuration).message).toContain('motion.duration')
  })

  it('refuses a density outside the three declared values', () => {
    const input = skin()
    input.space.density = 'cosy'
    expect(refusal(input).message).toContain('compact, comfortable, spacious')
  })

  it('refuses a token value carrying CSS syntax, since the sheet is generated', () => {
    // A skin is a shareable JSON file. If a value could close a declaration it
    // would be code, not data, and a skin from an untrusted source could style
    // anything on the page.
    for (const hostile of [
      'sans-serif; background: url(https://evil.example/x)',
      'sans-serif} :root{--cogenta-color-bg: red',
      'url(https://evil.example/pixel.png)',
    ]) {
      const input = skin()
      input.font.sans = hostile
      expect(refusal(input).code).toBe('SKIN_TOKEN_INVALID')
    }
  })
})

describe('refusing insufficient contrast', () => {
  const cases = [
    { pair: 'fg/bg', foreground: 'fg', background: 'bg' },
    { pair: 'accentFg/accent', foreground: 'accentFg', background: 'accent' },
    { pair: 'mutedFg/muted', foreground: 'mutedFg', background: 'muted' },
  ] as const

  for (const { pair, foreground, background } of cases) {
    it(`refuses ${pair} at 4.4:1 and says which pair and by how much`, () => {
      const input = skin()
      input.color[foreground] = BOUNDARY.justUnderAa
      input.color[background] = BOUNDARY.white
      const error = refusal(input)

      expect(error.code).toBe('SKIN_CONTRAST_INSUFFICIENT')
      expect(error.message).toContain(`color.${foreground}`)
      expect(error.message).toContain(`color.${background}`)
      expect(error.message).toContain('4.47:1')
      expect(error.message).toContain('needs 4.5:1')
      expect(error.message).toContain('short by 0.02')
      expect(error.hint).toBeDefined()
    })
  }

  it('refuses a pair that would only pass as large text', () => {
    // 3:1 is the large-text floor. No pair in theme@1.0 is declared large,
    // because accent and muted surfaces routinely carry body copy.
    const input = skin()
    input.color.accentFg = BOUNDARY.largeTextOnly
    input.color.accent = BOUNDARY.white
    expect(refusal(input).code).toBe('SKIN_CONTRAST_INSUFFICIENT')
  })

  it('reports all three failing pairs in one refusal', () => {
    const input = skin()
    input.color = {
      bg: '#ffffff',
      fg: '#888888',
      accent: '#ffffff',
      accentFg: '#999999',
      muted: '#ffffff',
      mutedFg: '#aaaaaa',
      border: '#d7dade',
    }
    const error = refusal(input)
    const failures = error.details?.failures
    expect(Array.isArray(failures) && failures.length).toBe(3)
  })

  it('measures a translucent foreground as composited, not as declared', () => {
    const input = skin()
    input.color.fg = 'rgb(0 0 0 / 0.3)'
    expect(refusal(input).code).toBe('SKIN_CONTRAST_INSUFFICIENT')
  })
})

describe('refusing a broken typographic scale', () => {
  it('refuses a ratio of 1, which flattens the heading hierarchy', () => {
    const input = skin()
    input.font.scale = 1
    const error = refusal(input)

    expect(error.code).toBe('SKIN_SCALE_NOT_MONOTONIC')
    expect(error.message).toContain('not strictly increasing')
  })

  it('refuses a ratio below 1, which inverts the scale', () => {
    const input = skin()
    input.font.scale = 0.9
    expect(refusal(input).code).toBe('SKIN_SCALE_NOT_MONOTONIC')
  })

  it('refuses a non-numeric or non-finite ratio before it reaches the scale check', () => {
    const text = skin()
    text.font.scale = '1.25'
    expect(refusal(text).code).toBe('SKIN_TOKEN_INVALID')

    const zero = skin()
    zero.font.scale = 0
    expect(refusal(zero).code).toBe('SKIN_TOKEN_INVALID')
  })

  it('computes a strictly increasing ladder around the base size', () => {
    const scale = computeTypeScale(VALID_SKIN)
    expect(scale.md).toBe('1rem')
    const values = Object.values(scale).map((size) => Number.parseFloat(size))
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('refusing a skin that ignores reduced motion', () => {
  it('refuses motion.reduced = false', () => {
    const input = skin()
    input.motion.reduced = false
    const error = refusal(input)

    expect(error.code).toBe('SKIN_MOTION_NOT_REDUCED')
    expect(error.hint).toContain('prefers-reduced-motion')
  })

  it('refuses a missing motion.reduced', () => {
    const input = skin()
    input.motion.reduced = undefined
    const error = refusal(input)

    expect(error.code).toBe('SKIN_TOKEN_MISSING')
    expect(error.message).toContain('motion.reduced')
  })

  it('refuses a motion.reduced that is not a boolean', () => {
    const input = skin()
    input.motion.reduced = 'yes'
    expect(refusal(input).code).toBe('SKIN_TOKEN_INVALID')
  })
})
