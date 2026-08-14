import { describe, expect, it } from 'vitest'
import { compareToBudget } from '../../src/performance/budget.js'

describe('compareToBudget', () => {
  it('flags a metric that exceeds its budget', () => {
    const findings = compareToBudget({ lcpP75Ms: 3000 }, { lcpMs: 2500 })
    expect(findings).toContainEqual(expect.objectContaining({ check: 'lcp_budget' }))
  })

  it('does not flag a metric within budget', () => {
    const findings = compareToBudget({ lcpP75Ms: 2000 }, { lcpMs: 2500 })
    expect(findings).toEqual([])
  })

  it('skips a metric with no budget set', () => {
    const findings = compareToBudget({ lcpP75Ms: 5000 }, {})
    expect(findings).toEqual([])
  })

  it('skips a metric CrUX has no data for', () => {
    const findings = compareToBudget({}, { lcpMs: 2500 })
    expect(findings).toEqual([])
  })

  it('checks all four metrics independently', () => {
    const findings = compareToBudget(
      { lcpP75Ms: 3000, clsP75: 0.3, inpP75Ms: 300, ttfbP75Ms: 900 },
      { lcpMs: 2500, clsScore: 0.1, inpMs: 200, ttfbMs: 800 },
    )
    expect(findings.map((f) => f.check).sort()).toEqual(
      ['cls_budget', 'inp_budget', 'lcp_budget', 'ttfb_budget'].sort(),
    )
  })
})
