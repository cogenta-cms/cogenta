import type { ContentBlock } from './content-client.js'
import { authHeader, request } from './http.js'

/**
 * `/api/patterns` — the page builder's motif/model library (fiche 43
 * sub-chantier A; fiche 05 task 1).
 *
 * Admin/editor only, on every method — a pattern is a builder fixture, never
 * content a lesser role reads (`pattern-router.ts`'s own reasoning). The
 * shape mirrors `@cogenta/schema`'s `Pattern` by hand, the same way every
 * other client module here copies its own server-side wire shape.
 */

export type PatternKind = 'pattern' | 'template'

/** Contract A's own provenance values (`@cogenta/schema`'s `Provenance`), copied by hand. */
export type Provenance = 'human' | 'assisted' | 'generated'

export interface PatternProvenanceDetail {
  readonly agent?: string
  readonly model?: string
  readonly at?: string
  readonly prompt?: string
}

export interface Pattern {
  readonly id: string
  readonly name: string
  readonly category: string | null
  readonly kind: PatternKind
  readonly blocks: readonly ContentBlock[]
  readonly provenance: Provenance
  readonly provenanceDetail: PatternProvenanceDetail | null
  readonly createdAt: string
  readonly updatedAt: string
}

export function listPatterns(token: string, kind?: PatternKind): Promise<readonly Pattern[]> {
  return request(`/api/patterns${kind === undefined ? '' : `?kind=${kind}`}`, {
    headers: authHeader(token),
  })
}

export function readPattern(token: string, id: string): Promise<Pattern> {
  return request(`/api/patterns/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export interface CreatePatternInput {
  readonly name: string
  readonly category?: string | null
  readonly kind: PatternKind
  readonly blocks: readonly ContentBlock[]
  /** Defaults server-side to `'human'`. Pass `'generated'` for a pattern an agent produced. */
  readonly provenance?: Provenance
  readonly provenanceDetail?: PatternProvenanceDetail | null
}

export function createPattern(token: string, input: CreatePatternInput): Promise<Pattern> {
  return request('/api/patterns', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export interface UpdatePatternInput {
  readonly name?: string
  /** Absent leaves it untouched; `null` clears it; a string reassigns it. */
  readonly category?: string | null
}

export function updatePattern(
  token: string,
  id: string,
  input: UpdatePatternInput,
): Promise<Pattern> {
  return request(`/api/patterns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deletePattern(token: string, id: string): Promise<void> {
  await request(`/api/patterns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
