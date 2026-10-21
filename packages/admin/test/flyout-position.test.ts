import { describe, expect, it } from 'vitest'
import { placeFlyout } from '../src/shell/flyout-position.js'

const base = { viewportHeight: 720, topInset: 72, margin: 8 }

describe('placeFlyout', () => {
  it('opens level with its trigger when there is room below', () => {
    expect(placeFlyout({ ...base, triggerTop: 200, flyoutHeight: 300 })).toEqual({
      top: 200,
      maxHeight: 632,
    })
  })

  it('slides up so the last entry stays above the bottom edge', () => {
    const { top } = placeFlyout({ ...base, triggerTop: 560, flyoutHeight: 440 })
    expect(top + 440).toBeLessThanOrEqual(720 - 8)
    expect(top).toBeGreaterThanOrEqual(72 + 8)
  })

  it('caps a flyout taller than the window so it scrolls by itself', () => {
    const placed = placeFlyout({ ...base, triggerTop: 300, flyoutHeight: 2000 })
    expect(placed.top).toBe(80)
    expect(placed.maxHeight).toBe(632)
  })

  it('never goes under the top bar when the trigger is scrolled above it', () => {
    expect(placeFlyout({ ...base, triggerTop: 10, flyoutHeight: 100 }).top).toBe(80)
  })
})
