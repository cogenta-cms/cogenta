import { describe, expect, it } from 'vitest'
import { checkTerminology } from '../../src/content/terminology.js'

const RULES = [
  { banned: 'AI', preferred: 'agent' },
  { banned: 'signup', preferred: 'sign up' },
]

describe('checkTerminology', () => {
  it('flags a banned term with the preferred replacement', () => {
    const findings = checkTerminology('Our AI helps you write.', RULES)
    expect(findings).toContainEqual(
      expect.objectContaining({ check: 'terminology', message: expect.stringContaining('agent') }),
    )
  })

  it('is case-insensitive', () => {
    expect(checkTerminology('our ai helps', RULES)).toHaveLength(1)
  })

  it('matches whole words only, not substrings', () => {
    expect(checkTerminology('the container is ready', RULES)).toEqual([])
  })

  it('finds nothing when the text uses no banned terms', () => {
    expect(checkTerminology('Our agent helps you sign up.', RULES)).toEqual([])
  })

  it('reports how many times a term was used', () => {
    const findings = checkTerminology('AI is great. AI helps a lot.', RULES)
    expect(findings[0]?.message).toContain('2 time')
  })

  it('flags every rule that has a match, independently', () => {
    const findings = checkTerminology('Our AI handles signup.', RULES)
    expect(findings).toHaveLength(2)
  })
})
