import type { CommentSummary, ModeratableStatus } from '@cogenta/agents'

/**
 * Which pending comments are already settled by the site's own checks, and
 * which are a judgement call (L5 task 10, Modération).
 *
 * The anti-spam pass of `@cogenta/comments` runs at submission and stores its
 * verdict. This turns that verdict into decisions an agent may carry out —
 * and, just as importantly, into the list it must leave alone. A model is
 * never asked whether something is spam; it is asked to explain the ones the
 * code could not settle.
 */

export interface ModerationDecision {
  readonly id: string
  readonly status: ModeratableStatus
  readonly reason: string
}

export interface ModerationTriage {
  /** Safe to act on: the deterministic verdict is unambiguous. */
  readonly decided: readonly ModerationDecision[]
  /** Left pending on purpose — a human (or a model's opinion in the report) decides. */
  readonly undecided: readonly CommentSummary[]
}

export function triageComments(comments: readonly CommentSummary[]): ModerationTriage {
  const decided: ModerationDecision[] = []
  const undecided: CommentSummary[] = []

  for (const comment of comments) {
    if (comment.flagged && comment.severity === 'high') {
      decided.push({
        id: comment.id,
        status: 'spam',
        reason: `The site's own checks flagged it: ${comment.reason}`,
      })
      continue
    }
    if (!comment.flagged) {
      decided.push({
        id: comment.id,
        status: 'approved',
        reason: "The site's own checks found nothing wrong with it.",
      })
      continue
    }
    // Flagged, but not squarely: exactly the case a moderator exists for.
    undecided.push(comment)
  }

  return { decided, undecided }
}
