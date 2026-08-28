import { describe, expect, it } from 'vitest'
import { truncateAtWordBoundary } from '../../src/collections/word-count.js'

/**
 * Fiche 44 task 2 — the excerpt's auto-fill default is "the start of the
 * body text, cut to fit, never mid-word". These are the pure cases the
 * fiche's own "Tests exigés" names directly.
 */
describe('truncateAtWordBoundary', () => {
  it('returns the text unchanged when it already fits', () => {
    expect(truncateAtWordBoundary('A short sentence.', 100)).toBe('A short sentence.')
  })

  it('cuts at the last full word before the limit, never mid-word', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    // A limit that lands mid-word ("The quick brown fox ju|mps…", 23
    // characters in) must fall back to the last whole word before it — "fox",
    // never "ju".
    const result = truncateAtWordBoundary(text, 23)
    expect(result).toBe('The quick brown fox')
    expect(text.startsWith(result)).toBe(true)
    expect(result.length).toBeLessThanOrEqual(23)
  })

  it('falls back to a hard cut when the limit lands before the first space', () => {
    expect(truncateAtWordBoundary('Supercalifragilisticexpialidocious', 10)).toBe('Supercalif')
  })

  it('trims surrounding whitespace before and after cutting', () => {
    expect(truncateAtWordBoundary('  padded text  ', 100)).toBe('padded text')
    expect(truncateAtWordBoundary('  padded text that keeps going  ', 13)).toBe('padded text')
  })

  it('returns an empty string for empty input', () => {
    expect(truncateAtWordBoundary('', 50)).toBe('')
    expect(truncateAtWordBoundary('   ', 50)).toBe('')
  })
})
