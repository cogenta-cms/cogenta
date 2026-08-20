/**
 * Contract F (`comments@1.0`, ADR-0025). A comment is a fact recorded once —
 * never translated, never drafted, never versioned — attached to a contract A
 * entry it does not own a foreign key to (the entries table belongs to the
 * site's own schema, which this package never sees).
 */

export const COMMENT_STATUSES = ['pending', 'approved', 'spam', 'trash'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

/** ADR-0025: never inherited from the content store's default — a comment always says how it got here. */
export const COMMENT_PROVENANCES = ['human', 'assisted', 'generated'] as const
export type CommentProvenance = (typeof COMMENT_PROVENANCES)[number]

export interface CommentModeration {
  /** `null` until `assist.moderate` has run once for this comment (fiche 15 task 4). */
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
  /** Set for a signed-in author; `null` for an anonymous visitor. */
  readonly userId: string | null
  readonly authorName: string
  readonly authorEmail: string
  readonly authorUrl: string | null
  /** Plain text only — never HTML (R3, ADR-0025). */
  readonly body: string
  readonly status: CommentStatus
  /** sha256 of the submitting IP, salted — never the address itself (RGPD). `null` for a comment posted from the admin (a reply). */
  readonly ipHash: string | null
  readonly userAgent: string | null
  readonly moderation: CommentModeration
  readonly provenance: CommentProvenance
  readonly createdAt: string
  readonly updatedAt: string
  readonly moderatedAt: string | null
  readonly moderatedBy: string | null
}

export interface CommentAuthorInput {
  readonly userId?: string | null
  readonly name: string
  readonly email: string
  readonly url?: string | null
}

export interface CommentCreateInput {
  readonly collection: string
  readonly entryId: string
  readonly locale?: string | null
  readonly parentId?: string | null
  readonly author: CommentAuthorInput
  readonly body: string
  /** Overridden by the caller's moderation policy — `create()` itself never guesses it. */
  readonly status: CommentStatus
  readonly ipHash?: string | null
  readonly userAgent?: string | null
  readonly provenance?: CommentProvenance
}

export interface CommentListFilter {
  readonly status?: CommentStatus
  readonly collection?: string
  readonly entryId?: string
  /** Case-insensitive substring match against author name, email and body. */
  readonly search?: string
}

export interface CommentListOptions extends CommentListFilter {
  readonly limit?: number
  readonly offset?: number
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
