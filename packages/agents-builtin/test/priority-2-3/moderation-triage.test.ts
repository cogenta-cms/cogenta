import { assertDecisionAllowed, type CommentSummary } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { triageComments } from '../../src/moderation/triage.js'

function comment(overrides: Partial<CommentSummary> & { id: string }): CommentSummary {
  return {
    collection: 'article',
    entryId: 'entry-1',
    authorName: 'Someone',
    body: 'A perfectly ordinary comment.',
    status: 'pending',
    flagged: false,
    severity: 'none',
    reason: '',
    createdAt: '2026-09-17T09:00:00.000Z',
    ...overrides,
  }
}

describe('triaging a moderation queue', () => {
  it('decides only what the site’s own checks already settled', () => {
    const triage = triageComments([
      comment({ id: 'clean' }),
      comment({ id: 'spam', flagged: true, severity: 'high', reason: 'twelve links' }),
      comment({ id: 'doubtful', flagged: true, severity: 'low', reason: 'one link' }),
    ])

    expect(triage.decided.map((decision) => `${decision.id}:${decision.status}`)).toEqual([
      'clean:approved',
      'spam:spam',
    ])
    expect(triage.undecided.map((item) => item.id)).toEqual(['doubtful'])
  })

  it('refuses, in the host, a decision that contradicts the deterministic verdict', () => {
    expect(() =>
      assertDecisionAllowed({ flagged: true, severity: 'high' }, 'approved'),
    ).toThrowError(/flagged as spam/u)
    expect(() => assertDecisionAllowed({ flagged: false, severity: 'none' }, 'spam')).toThrowError(
      /found nothing wrong/u,
    )
    // The genuinely doubtful case is exactly the one a decision is allowed on,
    // because that is where judgement lives.
    expect(() => assertDecisionAllowed({ flagged: true, severity: 'low' }, 'spam')).not.toThrow()
  })
})
