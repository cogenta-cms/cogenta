import { describe, expect, it } from 'vitest'
import { createBudgetTracker } from '../../src/budget/tracker.js'

describe('createBudgetTracker', () => {
  it('allows calls when no limits are configured', () => {
    const tracker = createBudgetTracker({ limits: {} })
    expect(tracker.checkCall()).toEqual({ allowed: true })
  })

  it('refuses once callsPerHour is reached', () => {
    const tracker = createBudgetTracker({ limits: { callsPerHour: 2 } })

    expect(tracker.checkCall().allowed).toBe(true)
    tracker.recordCall({ inputTokens: 1, outputTokens: 1 })
    expect(tracker.checkCall().allowed).toBe(true)
    tracker.recordCall({ inputTokens: 1, outputTokens: 1 })
    expect(tracker.checkCall()).toEqual({ allowed: false, reason: 'callsPerHour' })
  })

  it('resets callsPerHour when the calendar hour changes', () => {
    let current = new Date('2026-01-01T10:59:00.000Z').getTime()
    const tracker = createBudgetTracker({ limits: { callsPerHour: 1 }, now: () => current })

    tracker.recordCall({ inputTokens: 1, outputTokens: 1 })
    expect(tracker.checkCall().allowed).toBe(false)

    current = new Date('2026-01-01T11:00:01.000Z').getTime()
    expect(tracker.checkCall().allowed).toBe(true)
  })

  it('refuses once tokensPerDay is reached, and resets on the next calendar day', () => {
    let current = new Date('2026-01-01T00:00:00.000Z').getTime()
    const tracker = createBudgetTracker({ limits: { tokensPerDay: 100 }, now: () => current })

    tracker.recordCall({ inputTokens: 60, outputTokens: 60 })
    expect(tracker.checkCall()).toEqual({ allowed: false, reason: 'tokensPerDay' })

    current = new Date('2026-01-02T00:00:00.000Z').getTime()
    expect(tracker.checkCall().allowed).toBe(true)
  })

  it('refuses once eurPerMonth is reached using the injected costOf, and resets on the next calendar month', () => {
    let current = new Date('2026-01-15T00:00:00.000Z').getTime()
    const tracker = createBudgetTracker({
      limits: { eurPerMonth: 1 },
      costOf: (usage) => (usage.inputTokens + usage.outputTokens) * 0.001,
      now: () => current,
    })

    tracker.recordCall({ inputTokens: 500, outputTokens: 600 })
    expect(tracker.checkCall()).toEqual({ allowed: false, reason: 'eurPerMonth' })

    current = new Date('2026-02-01T00:00:00.000Z').getTime()
    expect(tracker.checkCall().allowed).toBe(true)
  })

  it('never checks eurPerMonth against real cost when costOf is not given (defaults to 0)', () => {
    const tracker = createBudgetTracker({ limits: { eurPerMonth: 1 } })
    tracker.recordCall({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(tracker.checkCall().allowed).toBe(true)
  })

  it('checks callsPerHour before tokensPerDay before eurPerMonth', () => {
    const tracker = createBudgetTracker({ limits: { callsPerHour: 1, tokensPerDay: 1 } })
    tracker.recordCall({ inputTokens: 100, outputTokens: 100 })
    expect(tracker.checkCall().reason).toBe('callsPerHour')
  })
})
