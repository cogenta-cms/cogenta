import { describe, expect, it } from 'vitest'
import { createAssistUsageTracker } from '../../src/assist/usage.js'

describe('createAssistUsageTracker', () => {
  it('allows calls under the monthly cap', () => {
    const tracker = createAssistUsageTracker({ limits: { monthlyTokenLimit: 1000 } })

    expect(tracker.checkBudget()).toEqual({ allowed: true })
    tracker.record('assist.rewrite', { inputTokens: 100, outputTokens: 100 })

    expect(tracker.checkBudget()).toEqual({ allowed: true })
  })

  it('refuses once the monthly cap is reached', () => {
    const tracker = createAssistUsageTracker({ limits: { monthlyTokenLimit: 100 } })

    tracker.record('assist.rewrite', { inputTokens: 60, outputTokens: 40 })

    expect(tracker.checkBudget()).toEqual({ allowed: false })
  })

  it('never refuses with no limit configured', () => {
    const tracker = createAssistUsageTracker()

    tracker.record('assist.rewrite', { inputTokens: 1_000_000, outputTokens: 1_000_000 })

    expect(tracker.checkBudget()).toEqual({ allowed: true })
    expect(tracker.usage().limit).toBeUndefined()
    expect(tracker.usage().nearLimit).toBe(false)
  })

  it('signals near the limit at 80% and over it past 100%', () => {
    const tracker = createAssistUsageTracker({ limits: { monthlyTokenLimit: 1000 } })

    tracker.record('assist.rewrite', { inputTokens: 400, outputTokens: 400 })
    expect(tracker.usage()).toMatchObject({ percentUsed: 80, nearLimit: true, overLimit: false })

    tracker.record('assist.rewrite', { inputTokens: 200, outputTokens: 200 })
    expect(tracker.usage()).toMatchObject({ percentUsed: 120, nearLimit: true, overLimit: true })
  })

  it('breaks usage down per tool, sorted by tokens spent', () => {
    const tracker = createAssistUsageTracker({ limits: { monthlyTokenLimit: 10_000 } })

    tracker.record('assist.rewrite', { inputTokens: 50, outputTokens: 50 })
    tracker.record('assist.summarise', { inputTokens: 500, outputTokens: 500 })
    tracker.record('assist.rewrite', { inputTokens: 50, outputTokens: 50 })

    expect(tracker.usage().byTool).toEqual([
      { tool: 'assist.summarise', calls: 1, tokens: 1000 },
      { tool: 'assist.rewrite', calls: 2, tokens: 200 },
    ])
    expect(tracker.usage().tokensThisMonth).toBe(1200)
  })

  it('resets the bucket when the calendar month rolls over', () => {
    let now = Date.parse('2026-08-31T23:00:00Z')
    const tracker = createAssistUsageTracker({
      limits: { monthlyTokenLimit: 100 },
      now: () => now,
    })

    tracker.record('assist.rewrite', { inputTokens: 100, outputTokens: 0 })
    expect(tracker.checkBudget()).toEqual({ allowed: false })

    now = Date.parse('2026-09-01T00:30:00Z')
    expect(tracker.checkBudget()).toEqual({ allowed: true })
    expect(tracker.usage().tokensThisMonth).toBe(0)
    expect(tracker.usage().byTool).toEqual([])
  })
})
