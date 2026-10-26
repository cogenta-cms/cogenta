import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { describeInterval, translateTaskSummary } from '../src/lib/scheduled-summary.js'

/** A `t` that echoes the key and its parameters, so a test sees which sentence was chosen. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options === undefined ? key : `${key}:${JSON.stringify(options)}`) as unknown as TFunction

describe('translateTaskSummary', () => {
  it('reads a count out of the server line instead of showing the English text', () => {
    expect(translateTaskSummary('scheduled-publish', '3 published', t)).toBe(
      'scheduled.summary.published:{"count":3}',
    )
    expect(translateTaskSummary('trash-purge', '12 purged', t)).toBe(
      'scheduled.summary.purged:{"count":12}',
    )
  })

  it('keeps the several numbers of a subscription run apart', () => {
    expect(
      translateTaskSummary(
        'commerce-subscriptions',
        '2 billed, 1 dunning retried, 0 suspended, 4 renewal notices sent',
        t,
      ),
    ).toBe('scheduled.summary.subscriptions:{"billed":2,"retried":1,"suspended":0,"notices":4}')
  })

  it('says a generic "done" for a line it does not know, never the English text', () => {
    expect(translateTaskSummary('some-plugin-task', 'did a thing', t)).toBe('scheduled.noSummary')
    expect(translateTaskSummary('scheduled-publish', null, t)).toBe('scheduled.noSummary')
  })
})

describe('describeInterval', () => {
  it('picks the largest natural unit', () => {
    expect(describeInterval(60_000, t)).toBe('scheduled.every.minute')
    expect(describeInterval(15 * 60_000, t)).toBe('scheduled.every.minutes:{"count":15}')
    expect(describeInterval(3_600_000, t)).toBe('scheduled.every.hour')
    expect(describeInterval(86_400_000, t)).toBe('scheduled.every.day')
    expect(describeInterval(7 * 86_400_000, t)).toBe('scheduled.every.days:{"count":7}')
  })
})
