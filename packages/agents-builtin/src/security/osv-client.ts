import { CogentaError } from '@cogenta/core'
import type { SbomEntry } from './sbom.js'

export interface OsvVulnerability {
  readonly id: string
  readonly summary?: string
  readonly details?: string
  readonly aliases?: readonly string[]
  /** Normalised 0–10 CVSS base score, when OSV's response carries one — undefined when only a raw vector string (no parseable base score) is available. */
  readonly cvssScore?: number
}

export interface OsvMatch {
  readonly entry: SbomEntry
  readonly vulnerabilities: readonly OsvVulnerability[]
}

export interface QueryOsvOptions {
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
}

interface RawOsvSeverity {
  readonly type: string
  readonly score: string
}

interface RawOsvVulnerability {
  readonly id: string
  readonly summary?: string
  readonly details?: string
  readonly aliases?: readonly string[]
  readonly severity?: readonly RawOsvSeverity[]
  readonly database_specific?: { readonly severity?: string }
}

const QUALITATIVE_SEVERITY_SCORE: Readonly<Record<string, number>> = {
  CRITICAL: 9.5,
  HIGH: 7.5,
  MODERATE: 5.5,
  MEDIUM: 5.5,
  LOW: 2.5,
}

function extractCvssScore(raw: RawOsvVulnerability): number | undefined {
  for (const entry of raw.severity ?? []) {
    const asNumber = Number.parseFloat(entry.score)
    if (!Number.isNaN(asNumber) && asNumber >= 0 && asNumber <= 10) return asNumber
  }
  const qualitative = raw.database_specific?.severity?.toUpperCase()
  return qualitative === undefined ? undefined : QUALITATIVE_SEVERITY_SCORE[qualitative]
}

function normalize(raw: RawOsvVulnerability): OsvVulnerability {
  const cvssScore = extractCvssScore(raw)
  return {
    id: raw.id,
    ...(raw.summary === undefined ? {} : { summary: raw.summary }),
    ...(raw.details === undefined ? {} : { details: raw.details }),
    ...(raw.aliases === undefined ? {} : { aliases: raw.aliases }),
    ...(cvssScore === undefined ? {} : { cvssScore }),
  }
}

/**
 * "Ne signaler que si le site est réellement concerné : version installée
 * affectée." OSV's `/v1/query` endpoint already does exactly that matching
 * — given one concrete package + version, it returns only the
 * vulnerabilities whose `affected` ranges cover that version, so this
 * module does not re-implement semver-range matching on top of it.
 */
export async function queryOsv(
  entries: readonly SbomEntry[],
  options: QueryOsvOptions = {},
): Promise<readonly OsvMatch[]> {
  const doFetch = options.fetchImpl ?? fetch
  const url = options.baseUrl ?? 'https://api.osv.dev/v1/query'

  const matches: OsvMatch[] = []
  for (const entry of entries) {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: entry.version,
        package: { name: entry.name, ecosystem: entry.ecosystem },
      }),
    })
    if (!response.ok) {
      throw new CogentaError({
        code: 'SECURITY_OSV_QUERY_FAILED',
        message: `OSV query for "${entry.name}@${entry.version}" failed with status ${response.status}.`,
        hint: 'Check network connectivity and https://status.osv.dev.',
        details: { status: response.status, package: entry.name, version: entry.version },
      })
    }
    const body = (await response.json()) as { vulns?: readonly RawOsvVulnerability[] }
    if (body.vulns !== undefined && body.vulns.length > 0) {
      matches.push({ entry, vulnerabilities: body.vulns.map(normalize) })
    }
  }
  return matches
}
