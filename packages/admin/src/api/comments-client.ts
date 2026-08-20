import { authHeader, requestBody } from './http.js'

/**
 * `/api/comments` — contract F's moderation queue (ADR-0025), the admin's
 * own client for it.
 *
 * Same reasoning as `commerce-client.ts`: `@cogenta/comments`'s own router
 * does not wrap its body in `{ data }`, it is reused verbatim by `cogenta
 * serve`, so this file calls `requestBody`, never `request`.
 */

export const COMMENT_STATUSES = ['pending', 'approved', 'spam', 'trash'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

export interface CommentModeration {
  readonly flagged: boolean | null
  readonly severity: 'none' | 'low' | 'medium' | 'high' | null
  readonly reason: string | null
}

export interface Comment {
  readonly id: string
  readonly collection: string
  readonly entryId: string
  readonly locale: string | null
  readonly parentId: string | null
  readonly userId: string | null
  readonly authorName: string
  readonly authorEmail: string
  readonly authorUrl: string | null
  readonly body: string
  readonly status: CommentStatus
  readonly ipHash: string | null
  readonly userAgent: string | null
  readonly moderation: CommentModeration
  readonly provenance: 'human' | 'assisted' | 'generated'
  readonly createdAt: string
  readonly updatedAt: string
  readonly moderatedAt: string | null
  readonly moderatedBy: string | null
}

export interface CommentPage {
  readonly items: readonly Comment[]
  readonly total: number
}

export interface CommentCounts {
  readonly pending: number
  readonly approved: number
  readonly spam: number
  readonly trash: number
}

export interface ListCommentsOptions {
  readonly status?: CommentStatus
  readonly collection?: string
  readonly entryId?: string
  readonly q?: string
  readonly limit?: number
  readonly offset?: number
}

export async function listComments(
  token: string,
  options: ListCommentsOptions = {},
): Promise<CommentPage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return requestBody(`/api/comments${qs === '' ? '' : `?${qs}`}`, { headers: authHeader(token) })
}

export function getCommentCounts(token: string): Promise<CommentCounts> {
  return requestBody('/api/comments/counts', { headers: authHeader(token) })
}

export function setCommentStatus(
  token: string,
  id: string,
  status: CommentStatus,
): Promise<Comment> {
  return requestBody(`/api/comments/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  })
}

export function bulkSetCommentStatus(
  token: string,
  ids: readonly string[],
  status: CommentStatus,
): Promise<{ readonly updated: number }> {
  return requestBody('/api/comments/bulk', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ ids, status }),
  })
}

export function replyToComment(
  token: string,
  id: string,
  input: { readonly authorName: string; readonly authorEmail: string; readonly body: string },
): Promise<Comment> {
  return requestBody(`/api/comments/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function purgeComment(token: string, id: string): Promise<null> {
  return requestBody(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export interface CollectionCommentSettings {
  readonly collection: string
  readonly enabled: boolean | null
  readonly moderationRequired: boolean | null
}

export function getCollectionCommentSettings(
  token: string,
  collection: string,
): Promise<CollectionCommentSettings> {
  return requestBody(
    `/api/comments/settings/collection?collection=${encodeURIComponent(collection)}`,
    {
      headers: authHeader(token),
    },
  )
}

export function setCollectionCommentSettings(
  token: string,
  collection: string,
  values: { readonly enabled?: boolean; readonly moderationRequired?: boolean },
): Promise<CollectionCommentSettings> {
  return requestBody('/api/comments/settings/collection', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ collection, ...values }),
  })
}

export interface EntryCommentSettings {
  readonly collection: string
  readonly entryId: string
  readonly enabled: boolean | null
}

export function getEntryCommentSettings(
  token: string,
  collection: string,
  entryId: string,
): Promise<EntryCommentSettings> {
  return requestBody(
    `/api/comments/settings/entry?collection=${encodeURIComponent(collection)}&entryId=${encodeURIComponent(entryId)}`,
    { headers: authHeader(token) },
  )
}

export function setEntryCommentSettings(
  token: string,
  collection: string,
  entryId: string,
  enabled: boolean | null,
): Promise<EntryCommentSettings> {
  return requestBody('/api/comments/settings/entry', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ collection, entryId, enabled }),
  })
}
