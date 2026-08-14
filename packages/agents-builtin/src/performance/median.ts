import type { CruxMetrics } from './types.js'

export function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  if (lower === undefined || upper === undefined) return undefined
  return (lower + upper) / 2
}

const METRIC_FIELDS = ['lcpP75Ms', 'clsP75', 'inpP75Ms', 'ttfbP75Ms'] as const

/**
 * "Les mesures de performance sont bruitées. Une seule mesure ne prouve
 * rien. Médiane sur plusieurs exécutions." Combines several `CruxMetrics`
 * samples (e.g. repeated `queryCrux` calls) into one before it is ever
 * compared to a budget or a baseline — a field missing from some samples is
 * simply excluded from that field's median, not treated as zero.
 */
export function medianMetrics(samples: readonly CruxMetrics[]): CruxMetrics {
  const result: Record<string, number> = {}
  for (const field of METRIC_FIELDS) {
    const values = samples
      .map((sample) => sample[field])
      .filter((value): value is number => value !== undefined)
    const median = medianOf(values)
    if (median !== undefined) result[field] = median
  }
  return result as CruxMetrics
}
