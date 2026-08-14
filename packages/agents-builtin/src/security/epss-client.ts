import { CogentaError } from '@cogenta/core'

export interface EpssScore {
  readonly cve: string
  /** Probability of exploitation in the next 30 days, 0–1. */
  readonly epss: number
  readonly percentile: number
}

export interface QueryEpssOptions {
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
}

/**
 * "Croiser CVSS et EPSS (probabilité d'exploitation réelle)." FIRST.org's
 * EPSS API takes a comma-separated CVE list and returns a score per CVE it
 * recognises — a CVE it has no data for is simply absent from the result,
 * not an error.
 */
export async function queryEpss(
  cveIds: readonly string[],
  options: QueryEpssOptions = {},
): Promise<ReadonlyMap<string, EpssScore>> {
  if (cveIds.length === 0) return new Map()

  const doFetch = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.first.org/data/v1/epss'
  const url = `${baseUrl}?cve=${cveIds.join(',')}`

  const response = await doFetch(url)
  if (!response.ok) {
    throw new CogentaError({
      code: 'SECURITY_EPSS_QUERY_FAILED',
      message: `EPSS query failed with status ${response.status}.`,
      hint: 'Check network connectivity and https://www.first.org/epss.',
      details: { status: response.status },
    })
  }

  const body = (await response.json()) as {
    data?: readonly { readonly cve: string; readonly epss: string; readonly percentile: string }[]
  }
  const scores = new Map<string, EpssScore>()
  for (const item of body.data ?? []) {
    scores.set(item.cve, {
      cve: item.cve,
      epss: Number.parseFloat(item.epss),
      percentile: Number.parseFloat(item.percentile),
    })
  }
  return scores
}
