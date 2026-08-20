import type { Entry } from './content-client.js'
import { authHeader, requestBody } from './http.js'

/**
 * `GET /api/review` — the review queue over the wire (`schema@2.1`,
 * ADR-0027, fiche 37 task 3). Copied by hand from `@cogenta/api`'s
 * `review-router.ts`, the same reasoning `content-client.ts` documents for
 * why this bundle never imports a server package.
 */

export type ReviewQueueScope = 'assigned' | 'pending' | 'mine'

export interface ReviewQueueItem {
  readonly collection: string
  readonly entry: Entry
}

export async function listReviewQueue(
  token: string,
  scope: ReviewQueueScope,
): Promise<readonly ReviewQueueItem[]> {
  const body = await requestBody<{ readonly data: readonly ReviewQueueItem[] }>(
    `/api/review?scope=${encodeURIComponent(scope)}`,
    { headers: authHeader(token) },
  )
  return body.data
}
