import type { PerformanceFinding, PerformancePageInput } from './types.js'

const MODERN_FORMATS = new Set(['webp', 'avif'])
const LARGE_IMAGE_BYTES = 200_000
const MAX_THIRD_PARTY_SCRIPTS = 5

/**
 * "Identification de la cause probable (image non optimisée, script tiers,
 * bloc coûteux, requête lente)." CrUX is aggregate field data with no
 * resource-level breakdown, so it cannot itself name a cause — this scans
 * structural page metadata (already available via `content.read`) for
 * known, well-established risk factors instead of profiling anything at
 * runtime.
 *
 * "Bloc coûteux" (an expensive render block) and "requête lente" (a slow
 * request) are deliberately not checked here: neither has a principled
 * signal derivable from structural metadata alone — the first would need
 * real DOM/render-cost data, the second real per-resource timing/waterfall
 * data. Inventing a proxy for either would produce a finding this module
 * cannot actually back, which is worse than not checking at all.
 */
export function diagnosePerformanceRisks(
  page: PerformancePageInput,
): readonly PerformanceFinding[] {
  const findings: PerformanceFinding[] = []

  const missingDimensions = page.images.filter(
    (image) => image.width === undefined || image.height === undefined,
  )
  if (missingDimensions.length > 0) {
    findings.push({
      check: 'image_dimensions',
      severity: 'warning',
      message: `${missingDimensions.length} image(s) missing explicit width/height — a known cause of layout shift (CLS).`,
    })
  }

  const unoptimized = page.images.filter(
    (image) =>
      image.sizeBytes !== undefined &&
      image.sizeBytes > LARGE_IMAGE_BYTES &&
      (image.format === undefined || !MODERN_FORMATS.has(image.format.toLowerCase())),
  )
  if (unoptimized.length > 0) {
    findings.push({
      check: 'image_optimization',
      severity: 'warning',
      message: `${unoptimized.length} image(s) over ${LARGE_IMAGE_BYTES / 1000}KB with no modern format (webp/avif) — likely hurting LCP and bandwidth.`,
    })
  }

  if (page.thirdPartyScriptUrls.length > MAX_THIRD_PARTY_SCRIPTS) {
    findings.push({
      check: 'third_party_scripts',
      severity: 'warning',
      message: `${page.thirdPartyScriptUrls.length} third-party scripts — likely main-thread contention (INP) and extra connection overhead (TTFB).`,
    })
  }

  return findings
}
