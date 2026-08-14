import type { CruxMetrics, PerformanceFinding } from './types.js'

const DEFAULT_THRESHOLD_RATIO = 0.15

interface RegressionCheck {
  readonly check: string
  readonly metric: keyof CruxMetrics
  readonly label: string
  readonly unit: string
}

const CHECKS: readonly RegressionCheck[] = [
  { check: 'lcp_regression', metric: 'lcpP75Ms', label: 'LCP', unit: 'ms' },
  { check: 'cls_regression', metric: 'clsP75', label: 'CLS', unit: '' },
  { check: 'inp_regression', metric: 'inpP75Ms', label: 'INP', unit: 'ms' },
  { check: 'ttfb_regression', metric: 'ttfbP75Ms', label: 'TTFB', unit: 'ms' },
]

export interface DetectRegressionOptions {
  readonly thresholdRatio?: number
}

/**
 * "Les mesures de performance sont bruitées. Une seule mesure ne prouve
 * rien... seuil de régression assez large pour ne pas crier à chaque
 * déploiement." A 15% default threshold — deliberately generous — is why
 * this only fires on a real, sustained regression rather than normal
 * field-data jitter between two measurement windows. Every metric here is
 * "higher is worse" (LCP/INP/TTFB are durations, CLS is a shift score), so
 * the comparison direction is the same for all four. A metric missing from
 * either side is skipped, never flagged.
 */
export function detectRegression(
  current: CruxMetrics,
  baseline: CruxMetrics,
  options: DetectRegressionOptions = {},
): readonly PerformanceFinding[] {
  const thresholdRatio = options.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO
  const findings: PerformanceFinding[] = []

  for (const { check, metric, label, unit } of CHECKS) {
    const currentValue = current[metric]
    const baselineValue = baseline[metric]
    if (currentValue === undefined || baselineValue === undefined) continue
    if (baselineValue <= 0) continue

    const ratio = (currentValue - baselineValue) / baselineValue
    if (ratio > thresholdRatio) {
      findings.push({
        check,
        severity: 'warning',
        message: `${label} regressed from ${baselineValue}${unit} to ${currentValue}${unit} (+${(ratio * 100).toFixed(0)}%).`,
      })
    }
  }

  return findings
}
