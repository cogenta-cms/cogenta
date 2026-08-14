import { describe, expect, it } from 'vitest'
import { detectRegression } from '../../src/performance/regression.js'

describe('detectRegression', () => {
  it('flags a metric worse than baseline by more than the threshold', () => {
    const findings = detectRegression({ lcpP75Ms: 3000 }, { lcpP75Ms: 2000 })
    expect(findings).toContainEqual(expect.objectContaining({ check: 'lcp_regression' }))
  })

  it('does not flag small jitter within the default 15% threshold', () => {
    const findings = detectRegression({ lcpP75Ms: 2200 }, { lcpP75Ms: 2000 })
    expect(findings).toEqual([])
  })

  it('does not flag an improvement', () => {
    const findings = detectRegression({ lcpP75Ms: 1500 }, { lcpP75Ms: 2000 })
    expect(findings).toEqual([])
  })

  it('skips a metric missing from either side', () => {
    expect(detectRegression({}, { lcpP75Ms: 2000 })).toEqual([])
    expect(detectRegression({ lcpP75Ms: 3000 }, {})).toEqual([])
  })

  it('honours a custom threshold ratio', () => {
    const findings = detectRegression(
      { lcpP75Ms: 2100 },
      { lcpP75Ms: 2000 },
      { thresholdRatio: 0.02 },
    )
    expect(findings).toContainEqual(expect.objectContaining({ check: 'lcp_regression' }))
  })

  it('skips a baseline of zero rather than dividing by it', () => {
    expect(detectRegression({ lcpP75Ms: 100 }, { lcpP75Ms: 0 })).toEqual([])
  })
})
