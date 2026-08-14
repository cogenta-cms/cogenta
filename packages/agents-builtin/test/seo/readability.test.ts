import { describe, expect, it } from 'vitest'
import { countWords, fleschReadingEase } from '../../src/seo/readability.js'

describe('fleschReadingEase', () => {
  it('scores simple, short-sentence text higher than complex, long-sentence text', () => {
    const simple = 'The cat sat. The dog ran. It was fun.'
    const complex =
      'The extraordinarily sophisticated methodology employed in this investigation necessitates comprehensive elucidation of its multifaceted theoretical underpinnings.'

    expect(fleschReadingEase(simple)).toBeGreaterThan(fleschReadingEase(complex))
  })

  it('returns 0 for empty text', () => {
    expect(fleschReadingEase('')).toBe(0)
    expect(fleschReadingEase('   ')).toBe(0)
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0)
  })

  it('collapses repeated whitespace', () => {
    expect(countWords('one   two\nthree')).toBe(3)
  })
})
