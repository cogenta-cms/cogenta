import { describe, expect, it } from 'vitest'
import { mergeSkinTokens, validateSkin } from '../../src/skin/index.js'
import { VALID_SKIN } from './fixtures.js'

describe('mergeSkinTokens', () => {
  it('overlays only the keys an override touches, leaving siblings untouched', () => {
    const merged = mergeSkinTokens(VALID_SKIN, { color: { accent: '#ff0000' } })
    expect(merged.color.accent).toBe('#ff0000')
    expect(merged.color.bg).toBe(VALID_SKIN.color.bg)
    expect(merged.color.fg).toBe(VALID_SKIN.color.fg)
  })

  it('leaves a group untouched entirely when the override omits it', () => {
    const merged = mergeSkinTokens(VALID_SKIN, { color: { accent: '#ff0000' } })
    expect(merged.font).toEqual(VALID_SKIN.font)
    expect(merged.space).toEqual(VALID_SKIN.space)
  })

  it('merges across several groups at once', () => {
    const merged = mergeSkinTokens(VALID_SKIN, {
      color: { accent: '#ff0000' },
      radius: { lg: '24px' },
    })
    expect(merged.color.accent).toBe('#ff0000')
    expect(merged.radius.lg).toBe('24px')
    expect(merged.radius.sm).toBe(VALID_SKIN.radius.sm)
  })

  it('is a no-op with an empty override', () => {
    expect(mergeSkinTokens(VALID_SKIN, {})).toEqual(VALID_SKIN)
  })

  it('produces a skin that still passes contract D validation', () => {
    const merged = mergeSkinTokens(VALID_SKIN, {
      color: { accent: '#0a7d3c', accentFg: '#ffffff' },
    })
    expect(() => validateSkin(merged)).not.toThrow()
  })

  it('produces a skin that validateSkin still refuses when an override breaks contrast', () => {
    const merged = mergeSkinTokens(VALID_SKIN, { color: { fg: '#fefefe' } })
    expect(() => validateSkin(merged)).toThrow(/contrast/i)
  })
})
