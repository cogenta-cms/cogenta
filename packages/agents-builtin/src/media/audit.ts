/**
 * What is wrong with a media library, computed — never guessed (L5 task 10).
 *
 * The rule the priority-1 agents established holds here: the model never
 * decides *that* something is a problem, only how to word the fix. Every
 * finding below comes out of arithmetic on real rows, so the same library
 * always produces the same list, and a test can pin it.
 */

export type MediaIssue = 'missing-alt' | 'unused' | 'oversized'

export interface MediaAuditAsset {
  readonly id: string
  readonly kind: 'image' | 'video' | 'audio' | 'file'
  readonly filename: string
  readonly size: number
  readonly width: number | null
  readonly height: number | null
  readonly alt: string
  readonly decorative: boolean
  readonly createdAt: string
}

export interface MediaFinding {
  readonly issue: MediaIssue
  readonly id: string
  readonly filename: string
  /** One sentence, in English like every other agent finding, for the report to translate. */
  readonly detail: string
}

export interface MediaAuditOptions {
  /** Ids referenced by at least one entry. Anything outside it is a candidate for `unused`. */
  readonly referenced: ReadonlySet<string>
  /** How old an unreferenced file must be before it counts as unused. A file uploaded an hour ago is simply not placed yet. */
  readonly unusedAfterDays?: number
  /** Bytes per displayed pixel above which an image is oversized. 1 byte/px is already generous for a photograph. */
  readonly maxBytesPerPixel?: number
  readonly now?: Date
}

const DEFAULT_UNUSED_AFTER_DAYS = 30
const DEFAULT_MAX_BYTES_PER_PIXEL = 1
const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, now: Date): number {
  const at = Date.parse(from)
  if (Number.isNaN(at)) return 0
  return (now.getTime() - at) / DAY_MS
}

export function auditMediaLibrary(
  assets: readonly MediaAuditAsset[],
  options: MediaAuditOptions,
): readonly MediaFinding[] {
  const now = options.now ?? new Date()
  const unusedAfter = options.unusedAfterDays ?? DEFAULT_UNUSED_AFTER_DAYS
  const maxBytesPerPixel = options.maxBytesPerPixel ?? DEFAULT_MAX_BYTES_PER_PIXEL
  const findings: MediaFinding[] = []

  for (const asset of assets) {
    // A decorative image is *meant* to have an empty alt (WCAG): flagging it
    // would be the false positive that gets an agent muted.
    if (asset.kind === 'image' && !asset.decorative && asset.alt.trim() === '') {
      findings.push({
        issue: 'missing-alt',
        id: asset.id,
        filename: asset.filename,
        detail: 'An image with no alt text: a screen reader announces nothing for it.',
      })
    }

    if (!options.referenced.has(asset.id) && daysBetween(asset.createdAt, now) >= unusedAfter) {
      findings.push({
        issue: 'unused',
        id: asset.id,
        filename: asset.filename,
        detail: `No published entry references it, ${Math.floor(daysBetween(asset.createdAt, now))} days after it was uploaded.`,
      })
    }

    if (asset.kind === 'image' && asset.width !== null && asset.height !== null) {
      const pixels = asset.width * asset.height
      if (pixels > 0 && asset.size / pixels > maxBytesPerPixel) {
        findings.push({
          issue: 'oversized',
          id: asset.id,
          filename: asset.filename,
          detail: `${Math.round(asset.size / 1024)} kB for ${asset.width}×${asset.height} pixels — heavier than the picture needs.`,
        })
      }
    }
  }

  return findings
}
