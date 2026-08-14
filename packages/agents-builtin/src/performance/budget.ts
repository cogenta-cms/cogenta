import type { CruxMetrics, PerformanceBudget, PerformanceFinding } from './types.js'

interface BudgetCheck {
  readonly check: string
  readonly metric: keyof CruxMetrics
  readonly budgetField: keyof PerformanceBudget
  readonly label: string
  readonly unit: string
}

const CHECKS: readonly BudgetCheck[] = [
  { check: 'lcp_budget', metric: 'lcpP75Ms', budgetField: 'lcpMs', label: 'LCP', unit: 'ms' },
  { check: 'cls_budget', metric: 'clsP75', budgetField: 'clsScore', label: 'CLS', unit: '' },
  { check: 'inp_budget', metric: 'inpP75Ms', budgetField: 'inpMs', label: 'INP', unit: 'ms' },
  { check: 'ttfb_budget', metric: 'ttfbP75Ms', budgetField: 'ttfbMs', label: 'TTFB', unit: 'ms' },
]

/**
 * A metric with no budget set, or no CrUX data at all, is silently skipped
 * — neither is a finding. Only a measured metric that exceeds a budget the
 * caller actually declared produces one.
 */
export function compareToBudget(
  metrics: CruxMetrics,
  budget: PerformanceBudget,
): readonly PerformanceFinding[] {
  const findings: PerformanceFinding[] = []
  for (const { check, metric, budgetField, label, unit } of CHECKS) {
    const value = metrics[metric]
    const limit = budget[budgetField]
    if (value === undefined || limit === undefined) continue
    if (value > limit) {
      findings.push({
        check,
        severity: 'warning',
        message: `${label} is ${value}${unit} (p75), over the ${limit}${unit} budget.`,
      })
    }
  }
  return findings
}
