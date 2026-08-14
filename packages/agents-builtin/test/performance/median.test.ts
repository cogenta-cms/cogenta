import { describe, expect, it } from 'vitest'
import { medianMetrics, medianOf } from '../../src/performance/median.js'

describe('medianOf', () => {
  it('returns undefined for an empty list', () => {
    expect(medianOf([])).toBeUndefined()
  })

  it('returns the middle value for an odd-length list', () => {
    expect(medianOf([3, 1, 2])).toBe(2)
  })

  it('averages the two middle values for an even-length list', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
  })

  it('does not mutate the input array', () => {
    const values = [3, 1, 2]
    medianOf(values)
    expect(values).toEqual([3, 1, 2])
  })
})

describe('medianMetrics', () => {
  it('takes the median of each field independently across samples', () => {
    const result = medianMetrics([
      { lcpP75Ms: 1000, clsP75: 0.05 },
      { lcpP75Ms: 3000, clsP75: 0.15 },
      { lcpP75Ms: 2000, clsP75: 0.1 },
    ])

    expect(result).toEqual({ lcpP75Ms: 2000, clsP75: 0.1 })
  })

  it('skips a field missing from some samples rather than treating it as zero', () => {
    const result = medianMetrics([{ lcpP75Ms: 1000 }, { lcpP75Ms: 3000, inpP75Ms: 200 }])

    expect(result).toEqual({ lcpP75Ms: 2000, inpP75Ms: 200 })
  })

  it('returns an empty object for no samples', () => {
    expect(medianMetrics([])).toEqual({})
  })
})
