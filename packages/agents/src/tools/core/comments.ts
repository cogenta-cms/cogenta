import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `comments.list` / `comments.decide` — the moderation queue, opened to an
 * agent (L5 task 10, Modération).
 *
 * Structural ports rather than an import of `@cogenta/comments`: the same
 * shape `not-found-log.ts` and `redirects.ts` already use, and for the same
 * reason — the agent runtime describes what it needs, it does not depend on
 * the subsystem that provides it.
 *
 * **Two refusals are built into the signatures**, not left to the agent's
 * good behaviour:
 *
 * 1. There is no delete. A decision is a status (`approved`/`spam`), which a
 *    human can reverse from the moderation screen; a deletion cannot be.
 * 2. `comments.decide` carries the deterministic verdict the site already
 *    computed at submission time (`spamScore`/`flagged`), and the host's
 *    implementation is what refuses a decision that contradicts it. A model
 *    cannot talk its way past the anti-spam pass.
 */

export type ModeratableStatus = 'approved' | 'spam'

export interface CommentSummary {
  readonly id: string
  readonly collection: string
  readonly entryId: string
  readonly authorName: string
  /** Plain text, as stored — never HTML (R3, ADR-0025). */
  readonly body: string
  readonly status: string
  /** What the site's own anti-spam pass concluded when the comment was posted. */
  readonly flagged: boolean
  readonly severity: 'none' | 'low' | 'medium' | 'high'
  readonly reason: string
  readonly createdAt: string
}

export interface CommentModerationPort {
  /** The queue, oldest first. `pending` only: an agent has no business reopening settled comments. */
  pending(limit: number): Promise<readonly CommentSummary[]>
  /**
   * Applies one decision. Throws when it contradicts the deterministic
   * verdict — that refusal lives in the host, where the real record is, never
   * in the prompt.
   */
  decide(id: string, status: ModeratableStatus, reason: string): Promise<CommentDecisionReceipt>
  /** Puts a comment back exactly where it was — what makes `comments.decide` reversible for real (R6). */
  restore(receipt: CommentDecisionReceipt): Promise<void>
}

export interface CommentDecisionReceipt {
  readonly id: string
  /** The status the comment held before the decision, so `revert` restores it rather than guessing `pending`. */
  readonly previousStatus: string
  readonly previousReason: string
}

const ListInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
})
type ListInput = z.infer<typeof ListInputSchema>

const CommentSchema = z.object({
  id: z.string(),
  collection: z.string(),
  entryId: z.string(),
  authorName: z.string(),
  body: z.string(),
  status: z.string(),
  flagged: z.boolean(),
  severity: z.enum(['none', 'low', 'medium', 'high']),
  reason: z.string(),
  createdAt: z.string(),
})

const ListOutputSchema = z.object({ comments: z.array(CommentSchema) })
export type CommentsListOutput = z.infer<typeof ListOutputSchema>

export function createCommentsListTool(
  port: CommentModerationPort,
): ToolDefinition<ListInput, CommentsListOutput> {
  return defineTool({
    name: 'comments.list',
    version: '1.0.0',
    description:
      'List the comments waiting for moderation, oldest first, with the anti-spam verdict the site already computed for each.',
    input: ListInputSchema,
    output: ListOutputSchema,
    permissions: ['comments.moderate'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      return { comments: [...(await port.pending(input.limit ?? 20))] }
    },
  })
}

const DecideInputSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['approved', 'spam']),
  /** Why, in one sentence — kept with the comment, so a human sees what was decided and on what grounds. */
  reason: z.string().min(1).max(500),
})
type DecideInput = z.infer<typeof DecideInputSchema>

const DecideOutputSchema = z.object({
  id: z.string(),
  status: z.enum(['approved', 'spam']),
  /** Always `true` here: a status is reversible from the moderation screen, which is why this tool exists and a delete does not. */
  reversible: z.literal(true),
  /** What `revert` needs to put this comment back exactly as it was (R6). */
  previousStatus: z.string(),
  previousReason: z.string(),
})
export type CommentsDecideOutput = z.infer<typeof DecideOutputSchema>

export function createCommentsDecideTool(
  port: CommentModerationPort,
): ToolDefinition<DecideInput, CommentsDecideOutput> {
  return defineTool({
    name: 'comments.decide',
    version: '1.0.0',
    description:
      'Approve or refuse one pending comment, with a reason. Never deletes: a refused comment can be approved again by a human.',
    input: DecideInputSchema,
    output: DecideOutputSchema,
    permissions: ['comments.moderate'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    async execute(input) {
      const receipt = await port.decide(input.id, input.status, input.reason)
      return {
        id: input.id,
        status: input.status,
        reversible: true,
        previousStatus: receipt.previousStatus,
        previousReason: receipt.previousReason,
      }
    },
    async revert(receipt) {
      await port.restore({
        id: receipt.id,
        previousStatus: receipt.previousStatus,
        previousReason: receipt.previousReason,
      })
    },
  })
}

/**
 * The host-side rule `comments.decide` is built around: a decision that
 * contradicts the site's own anti-spam verdict is refused.
 *
 * Exported so the host wires the *same* rule the tool's doc promises, and so
 * it is testable without a database. "Contradicts" is deliberately narrow —
 * approving what the pass flagged as `high`, or refusing what it found clean
 * — because everything in between is precisely the judgement a moderator (or
 * an agent proposing to one) is there to make.
 */
export function assertDecisionAllowed(
  comment: Pick<CommentSummary, 'flagged' | 'severity'>,
  status: ModeratableStatus,
): void {
  if (status === 'approved' && comment.flagged && comment.severity === 'high') {
    throw new CogentaError({
      code: 'TOOL_CALL_REJECTED',
      message:
        'This comment was flagged as spam by the site’s own checks, so it cannot be approved here.',
      hint: 'A human can still approve it from the moderation screen.',
    })
  }
  if (status === 'spam' && !comment.flagged) {
    throw new CogentaError({
      code: 'TOOL_CALL_REJECTED',
      message:
        'The site’s own checks found nothing wrong with this comment, so it cannot be refused here.',
      hint: 'Leave it pending and say why in the report; a human decides.',
    })
  }
}
