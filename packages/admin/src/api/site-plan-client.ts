import { authHeader, request, requestBody } from './http.js'

/**
 * The thin fetch layer over `/api/site-plans` — hand-mirrored from
 * `@cogenta/api`'s `site-plan-router.ts`, the same way every other
 * `*-client.ts` in this directory copies its server-side shape by hand.
 *
 * Note what is deliberately missing: there is no `acceptAll`, and no way to
 * send a decision for anything but a named item. The rule that every item is
 * judged on its own lives on the server, and this client offers no vocabulary
 * for going round it.
 */

export type PlanItemDecision = 'accepted' | 'rejected'

export interface PlanItem {
  readonly id: string
  readonly section: string
  readonly title: string
  readonly detail: string
}

export interface PlanSection {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly mode: 'each' | 'one-of'
  readonly items: readonly PlanItem[]
}

export interface SitePlanSummary {
  readonly id: string
  readonly createdAt: string
  readonly activity: string
  readonly summary: string
  readonly sources: readonly string[]
  readonly decidedCount: number
  readonly appliedAt?: string
}

export interface SitePlanDetail extends SitePlanSummary {
  readonly draft: {
    readonly brief: {
      readonly activity: string
      readonly summary: string
      readonly languages: readonly string[]
      readonly warnings: readonly string[]
    }
    readonly violations: readonly { readonly explanation: string }[]
    readonly warnings: readonly string[]
  }
  readonly sections: readonly PlanSection[]
  readonly decisions: Readonly<Record<string, PlanItemDecision>>
}

export interface SitePlanList {
  readonly data: readonly SitePlanSummary[]
  /** `false` when the site has no LLM provider configured. The screen says so rather than showing an unexplained empty state. */
  readonly plannerAvailable: boolean
}

export interface AppliedPlanReport {
  readonly added: readonly string[]
  readonly skipped: readonly { readonly name: string; readonly reason: string }[]
  readonly entriesSeeded: number
  readonly skinApplied: boolean
  readonly followUp: readonly string[]
}

export interface UploadedDocument {
  readonly filename: string
  readonly contentBase64: string
}

/** The whole body, not just `data`: `plannerAvailable` sits beside it. */
export function listSitePlans(token: string): Promise<SitePlanList> {
  return requestBody('/api/site-plans', { headers: authHeader(token) })
}

export function getSitePlan(token: string, id: string): Promise<SitePlanDetail> {
  return request(`/api/site-plans/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export function proposeSitePlan(
  token: string,
  documents: readonly UploadedDocument[],
  siteName?: string,
): Promise<SitePlanDetail> {
  return request('/api/site-plans', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ documents, ...(siteName === undefined ? {} : { siteName }) }),
  })
}

export function recordSitePlanDecisions(
  token: string,
  id: string,
  decisions: Readonly<Record<string, PlanItemDecision>>,
): Promise<{ readonly id: string; readonly decisions: Record<string, PlanItemDecision> }> {
  return request(`/api/site-plans/${encodeURIComponent(id)}/decisions`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ decisions }),
  })
}

export function applySitePlan(
  token: string,
  id: string,
): Promise<SitePlanSummary & { readonly report: AppliedPlanReport }> {
  return request(`/api/site-plans/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function deleteSitePlan(token: string, id: string): Promise<{ readonly id: string }> {
  return request(`/api/site-plans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** Reads a file the browser handed us into the base64 envelope the API takes. */
export async function toUploadedDocument(file: File): Promise<UploadedDocument> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return { filename: file.name, contentBase64: btoa(binary) }
}
