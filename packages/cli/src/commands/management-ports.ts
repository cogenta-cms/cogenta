import {
  type AnalyticsSummaryPort,
  assertDecisionAllowed,
  type CommentModerationPort,
  type CommentSummary,
} from '@cogenta/agents'
import type { AnalyticsStore } from '@cogenta/analytics'
import type { CommentStore } from '@cogenta/comments'
import { CogentaError } from '@cogenta/core'

/**
 * The moderation queue and the audience figures, as the narrow ports
 * `@cogenta/agents` describes — built from the very stores the comment and
 * analytics routers use, never a second instance. One definition for the two
 * ways a site hands them out: the internal agents (`cogenta serve`'s agent
 * runtime) and an MCP client (`/api/mcp`, `cogenta mcp`).
 */
export function createCommentModerationPort(storeOf: () => CommentStore): CommentModerationPort {
  // A getter, not the store: the agent runtime is assembled before the comment
  // store exists, and only calls these long after both are built.
  return {
    pending: async (limit) =>
      (await storeOf().list({ status: 'pending', limit })).items.map((comment) => ({
        id: comment.id,
        collection: comment.collection,
        entryId: comment.entryId,
        authorName: comment.authorName,
        body: comment.body,
        status: comment.status,
        // A comment posted before the moderation pass existed carries
        // nothing: "not checked" reads as "not flagged", which is what
        // leaves it in the queue for a human rather than acting on it.
        flagged: comment.moderation.flagged ?? false,
        severity: comment.moderation.severity ?? 'none',
        reason: comment.moderation.reason ?? '',
        createdAt: comment.createdAt,
      })),
    decide: async (id, status, reason) => {
      const comment = await storeOf().get(id)
      if (comment === null) {
        throw new CogentaError({
          code: 'COMMENT_NOT_FOUND',
          message: `No comment "${id}".`,
          hint: 'It may have been decided already.',
        })
      }
      // The refusal the tool's own documentation promises, applied
      // where the real record is — never in the prompt.
      const flagged = comment.moderation.flagged ?? false
      const severity = comment.moderation.severity ?? 'none'
      assertDecisionAllowed({ flagged, severity }, status)
      await storeOf().setStatus(id, status, null)
      await storeOf().setModeration(id, { flagged, severity, reason })
      return {
        id,
        previousStatus: comment.status,
        previousReason: comment.moderation.reason ?? '',
      }
    },
    // R6 — what makes `comments.decide` reversible for real: the
    // comment goes back to the status and the note it had, never to a
    // guessed `pending`.
    restore: async (receipt) => {
      const comment = await storeOf().get(receipt.id)
      if (comment === null) return
      // R6: undo only what this call did. A person who decided the comment
      // again since (approved what the agent refused, or the reverse) made a
      // newer decision, and restoring the old status would overwrite it.
      if (receipt.decidedStatus !== undefined && comment.status !== receipt.decidedStatus) {
        throw new CogentaError({
          code: 'TOOL_REVERT_REFUSED',
          message: `Comment "${receipt.id}" is now ${comment.status}, no longer ${receipt.decidedStatus} as this call left it, so it was not put back.`,
          hint: 'It was decided again since. Change it from the moderation screen if that is what you want.',
          details: { id: receipt.id, status: comment.status, decidedStatus: receipt.decidedStatus },
        })
      }
      await storeOf().setStatus(
        receipt.id,
        receipt.previousStatus as 'pending' | 'approved' | 'spam' | 'trash',
        null,
      )
      await storeOf().setModeration(receipt.id, {
        flagged: comment.moderation.flagged ?? false,
        severity: comment.moderation.severity ?? 'none',
        reason: receipt.previousReason,
      })
    },
  }
}

/** The status and anti-spam verdict of one comment, or `null` — to refuse a doomed decision before a person is asked. */
export function createCommentFinder(
  storeOf: () => CommentStore,
): (id: string) => Promise<Pick<CommentSummary, 'flagged' | 'severity' | 'status'> | null> {
  return async (id) => {
    const comment = await storeOf().get(id)
    if (comment === null) return null
    return {
      status: comment.status,
      flagged: comment.moderation.flagged ?? false,
      severity: comment.moderation.severity ?? 'none',
    }
  }
}

export function createAnalyticsSummaryPort(storeOf: () => AnalyticsStore): AnalyticsSummaryPort {
  return {
    summary: async (days) => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const summary = await storeOf().getSummary({ since })
      return {
        since: summary.since,
        until: summary.until,
        totalViews: summary.totalViews,
        uniqueVisitors: summary.uniqueVisitors,
        topPages: summary.topPages.map((page) => ({
          path: page.path,
          views: page.views,
        })),
        previousTotalViews: summary.previousTotalViews,
      }
    },
  }
}
