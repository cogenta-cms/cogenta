import { CogentaError } from '@cogenta/core'
import type { Receipt, ReceiptQuery, ReceiptStore } from './types.js'

/**
 * In-process — enough for a single run or a single server process to revert
 * a call it just made. A durable store (surviving a restart) is later work,
 * the same "not needed until something depends on it" reasoning `withAudit`
 * and `captureTrace` already followed for their own stores.
 */
export function createMemoryReceiptStore(): ReceiptStore {
  const receipts = new Map<string, Receipt>()

  return {
    async save(receipt: Receipt): Promise<void> {
      receipts.set(receipt.id, receipt)
    },
    async get(id: string): Promise<Receipt | null> {
      return receipts.get(id) ?? null
    },
    async list(query: ReceiptQuery = {}): Promise<readonly Receipt[]> {
      return [...receipts.values()].filter(
        (receipt) =>
          (query.agentName === undefined || receipt.agentName === query.agentName) &&
          (query.toolName === undefined || receipt.toolName === query.toolName),
      )
    },
    async markReverted(id: string, revertedAt: string): Promise<void> {
      const existing = receipts.get(id)
      if (existing === undefined) {
        throw new CogentaError({
          code: 'RECEIPT_UNKNOWN',
          message: `No receipt with id "${id}".`,
          hint: 'Check the id, or list receipts to find the right one.',
        })
      }
      receipts.set(id, { ...existing, revertedAt })
    },
  }
}
