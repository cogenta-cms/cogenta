/**
 * Contract C's "reçu" (receipt): a reversible tool's own output, kept so
 * `revert(receipt, ctx)` can later be called with exactly what the original
 * call produced — nothing here is guessed or reconstructed.
 */
export interface Receipt {
  readonly id: string
  readonly agentName: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly output: unknown
  readonly executedAt: string
  readonly revertedAt?: string
}

export interface ReceiptQuery {
  readonly agentName?: string
  readonly toolName?: string
}

export interface ReceiptStore {
  save(receipt: Receipt): Promise<void>
  get(id: string): Promise<Receipt | null>
  list(query?: ReceiptQuery): Promise<readonly Receipt[]>
  markReverted(id: string, revertedAt: string): Promise<void>
}
