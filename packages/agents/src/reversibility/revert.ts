import { CogentaError } from '@cogenta/core'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { Receipt, ReceiptStore } from './types.js'

export interface RevertReceiptOptions {
  readonly store: ReceiptStore
  /** The tools this agent was actually run with — `revert` is looked up by name from here, not from the whole registry, so a call can only be undone by the same tool that made it. */
  readonly tools: readonly ExecutableTool[]
  readonly ctx: ToolExecutionContext
  readonly now?: () => number
}

/**
 * Looks up a past call by its receipt id and calls the tool's own `revert`
 * with exactly what that call produced. Refuses a receipt that was already
 * reverted (undoing an undo is not this function's job — a fresh, explicit
 * action is, if that is really what is wanted) and a tool that never
 * declared `revert` at all, even if the receipt itself is real.
 */
export async function revertReceipt(
  receiptId: string,
  options: RevertReceiptOptions,
): Promise<Receipt> {
  const receipt = await options.store.get(receiptId)
  if (receipt === null) {
    throw new CogentaError({
      code: 'RECEIPT_UNKNOWN',
      message: `No receipt with id "${receiptId}".`,
      hint: 'Check the id, or list receipts to find the right one.',
    })
  }
  if (receipt.revertedAt !== undefined) {
    throw new CogentaError({
      code: 'RECEIPT_ALREADY_REVERTED',
      message: `Receipt "${receiptId}" was already reverted at ${receipt.revertedAt}.`,
      hint: 'This receipt cannot be reverted twice; take a new action instead.',
    })
  }

  const tool = options.tools.find((candidate) => candidate.spec.name === receipt.toolName)
  if (tool?.revert === undefined) {
    throw new CogentaError({
      code: 'RECEIPT_NOT_REVERTIBLE',
      message: `"${receipt.toolName}" has no revert() available in this run.`,
      hint: 'Only a tool declared reversible: true, and present in the current manifest, can be reverted.',
    })
  }

  await tool.revert(receipt.output, options.ctx)
  const revertedAt = new Date((options.now ?? Date.now)()).toISOString()
  await options.store.markReverted(receiptId, revertedAt)
  return { ...receipt, revertedAt }
}
