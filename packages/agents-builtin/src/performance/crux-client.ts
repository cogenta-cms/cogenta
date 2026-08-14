import { CogentaError } from '@cogenta/core'
import type { CruxMetrics } from './types.js'

export type CruxFormFactor = 'PHONE' | 'DESKTOP' | 'TABLET'

export interface QueryCruxOptions {
  /** Injected — never hardcoded (R7). The caller sources this from wherever secrets are configured, never from the model's context. */
  readonly apiKey: string
  readonly fetchImpl?: typeof fetch
  readonly formFactor?: CruxFormFactor
  readonly baseUrl?: string
}

interface RawCruxRecord {
  readonly metrics?: {
    readonly largest_contentful_paint?: { readonly percentiles?: { readonly p75?: number } }
    readonly cumulative_layout_shift?: { readonly percentiles?: { readonly p75?: number } }
    readonly interaction_to_next_paint?: { readonly percentiles?: { readonly p75?: number } }
    readonly experimental_time_to_first_byte?: { readonly percentiles?: { readonly p75?: number } }
  }
}

function toMetrics(record: RawCruxRecord | undefined): CruxMetrics {
  const metrics = record?.metrics
  const lcp = metrics?.largest_contentful_paint?.percentiles?.p75
  const cls = metrics?.cumulative_layout_shift?.percentiles?.p75
  const inp = metrics?.interaction_to_next_paint?.percentiles?.p75
  const ttfb = metrics?.experimental_time_to_first_byte?.percentiles?.p75
  return {
    ...(lcp === undefined ? {} : { lcpP75Ms: lcp }),
    ...(cls === undefined ? {} : { clsP75: cls }),
    ...(inp === undefined ? {} : { inpP75Ms: inp }),
    ...(ttfb === undefined ? {} : { ttfbP75Ms: ttfb }),
  }
}

/**
 * "Il mesure le site déployé, pas un environnement local." Real Core Web
 * Vitals need either a headless browser (Lighthouse/Puppeteer — a heavy
 * native dependency, R9/R10) or the Chrome UX Report API, which is
 * real-user field data over plain HTTPS — no browser, and field data over
 * synthetic/lab data is the better fit for "measures the deployed site"
 * anyway. A 404 means CrUX has no data for this URL (not enough real-user
 * traffic) — that is data, not an error, and returns empty metrics rather
 * than throwing.
 */
export async function queryCrux(url: string, options: QueryCruxOptions): Promise<CruxMetrics> {
  const doFetch = options.fetchImpl ?? fetch
  const baseUrl =
    options.baseUrl ?? 'https://chromeuxreport.googleapis.com/v1beta/records:queryRecord'
  const endpoint = `${baseUrl}?key=${options.apiKey}`

  const response = await doFetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      ...(options.formFactor === undefined ? {} : { formFactor: options.formFactor }),
      metrics: [
        'largest_contentful_paint',
        'cumulative_layout_shift',
        'interaction_to_next_paint',
        'experimental_time_to_first_byte',
      ],
    }),
  })

  if (response.status === 404) return {}

  if (!response.ok) {
    throw new CogentaError({
      code: 'PERFORMANCE_CRUX_QUERY_FAILED',
      message: `CrUX query for "${url}" failed with status ${response.status}.`,
      hint: 'Check the API key and https://developers.google.com/speed/docs/insights/v5/about#crux-api-status.',
      details: { status: response.status, url },
    })
  }

  const body = (await response.json()) as { record?: RawCruxRecord }
  return toMetrics(body.record)
}
