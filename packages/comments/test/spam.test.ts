import { describe, expect, it } from 'vitest'
import { checkSpamHeuristics } from '../src/spam.js'

describe('checkSpamHeuristics', () => {
  it('does not flag ordinary text', () => {
    expect(checkSpamHeuristics('Great article, thanks for writing it!').suspect).toBe(false)
  })

  it('flags a body with more links than the threshold', () => {
    const body = 'Check http://a.com and http://b.com and www.c.com too'
    const result = checkSpamHeuristics(body)
    expect(result.suspect).toBe(true)
    expect(result.reasons[0]).toMatch(/links/)
  })

  it('flags a body matching a blocked term', () => {
    const result = checkSpamHeuristics('Buy cheap viagra online now')
    expect(result.suspect).toBe(true)
    expect(result.reasons.join(' ')).toMatch(/viagra/)
  })

  it('respects a custom link threshold', () => {
    const body = 'http://a.com http://b.com http://c.com'
    expect(checkSpamHeuristics(body, { maxLinks: 5 }).suspect).toBe(false)
  })
})
