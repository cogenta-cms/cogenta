/**
 * What an import left behind (L5 task 10, Migration).
 *
 * `@cogenta/import` (L9) produces a coherent site, not a finished one: links
 * still point at the old domain, images are still referenced by URL rather
 * than by media id, excerpts are missing. All four findings below are read
 * off the stored values — nothing here asks a model whether a link is
 * internal.
 */

export type MigrationIssue =
  | 'absolute-internal-link'
  | 'orphan-media-url'
  | 'missing-excerpt'
  | 'empty-common-field'

export interface MigrationEntry {
  readonly id: string
  readonly collection: string
  readonly title: string
  readonly path: string | null
  readonly provenance: string
  /** Flattened text of the entry — body, blocks, rich text — as the caller extracted it. */
  readonly text: string
  readonly values: Readonly<Record<string, unknown>>
}

export interface MigrationFinding {
  readonly issue: MigrationIssue
  readonly id: string
  readonly collection: string
  readonly title: string
  readonly detail: string
  /** For a link finding: the exact URL found, so a redirect can be proposed without re-scanning. */
  readonly url?: string
}

export interface MigrationOptions {
  /** Domains the site used to live on. A URL on one of them is an internal link written the old way. */
  readonly previousDomains: readonly string[]
  /** Fields most entries of a collection fill; one left empty on an imported entry is a gap worth naming. */
  readonly excerptFields?: readonly string[]
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/gu
const IMAGE_SUFFIX = /\.(?:jpe?g|png|gif|webp|avif|svg)$/iu

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

export function findMigrationResidue(
  entries: readonly MigrationEntry[],
  options: MigrationOptions,
): readonly MigrationFinding[] {
  const previous = new Set(options.previousDomains.map((domain) => domain.toLowerCase()))
  const excerptFields = options.excerptFields ?? ['excerpt', 'summary', 'description']
  const findings: MigrationFinding[] = []

  for (const entry of entries) {
    // Only what an import wrote. An entry someone typed here is not residue,
    // whatever it contains.
    if (entry.provenance !== 'imported') continue

    for (const url of entry.text.match(URL_PATTERN) ?? []) {
      const host = hostOf(url)
      if (host === null || !previous.has(host)) continue
      findings.push({
        issue: IMAGE_SUFFIX.test(new URL(url).pathname)
          ? 'orphan-media-url'
          : 'absolute-internal-link',
        id: entry.id,
        collection: entry.collection,
        title: entry.title,
        url,
        detail: IMAGE_SUFFIX.test(new URL(url).pathname)
          ? 'An image is still loaded from the old site rather than from this media library.'
          : 'A link still points at the old domain rather than at this site.',
      })
    }

    const excerpt = excerptFields
      .map((field) => entry.values[field])
      .find((value) => typeof value === 'string' && value.trim() !== '')
    if (excerpt === undefined && excerptFields.some((field) => field in entry.values)) {
      findings.push({
        issue: 'missing-excerpt',
        id: entry.id,
        collection: entry.collection,
        title: entry.title,
        detail:
          'No excerpt: listings and search results will show the first words of the body instead.',
      })
    }
  }

  return findings
}

/**
 * The redirects an import's own links imply: one per distinct old URL whose
 * path differs from where the entry now lives.
 *
 * Mechanical on purpose — a model has nothing to add to "this address moved
 * there", and `redirects.create` is reversible and audited (L22 task 3).
 */
export function redirectsFor(
  findings: readonly MigrationFinding[],
  entries: readonly MigrationEntry[],
): readonly { readonly from: string; readonly to: string }[] {
  const pathOf = new Map(entries.map((entry) => [entry.id, entry.path]))
  const seen = new Set<string>()
  const redirects: { from: string; to: string }[] = []

  for (const finding of findings) {
    if (finding.issue !== 'absolute-internal-link' || finding.url === undefined) continue
    const to = pathOf.get(finding.id)
    if (to === null || to === undefined) continue
    let from: string
    try {
      from = new URL(finding.url).pathname
    } catch {
      continue
    }
    if (from === to || seen.has(from)) continue
    seen.add(from)
    redirects.push({ from, to })
  }

  return redirects
}
