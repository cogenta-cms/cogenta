import { describe, expect, it } from 'vitest'
import { createMemoryReceiptStore } from '../../src/reversibility/receipt-store.js'
import type { Receipt } from '../../src/reversibility/types.js'

function receipt(id: string, agentName: string, toolName: string): Receipt {
  return {
    id,
    agentName,
    toolName,
    input: {},
    output: { ok: true },
    executedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('createMemoryReceiptStore', () => {
  it('returns null for an id that was never saved', async () => {
    const store = createMemoryReceiptStore()
    expect(await store.get('ghost')).toBeNull()
  })

  it('saves a receipt and reads it back unchanged', async () => {
    const store = createMemoryReceiptStore()
    const r = receipt('r1', 'security', 'content.publish')
    await store.save(r)
    expect(await store.get('r1')).toEqual(r)
  })

  it('filters list by agentName and toolName', async () => {
    const store = createMemoryReceiptStore()
    await store.save(receipt('r1', 'security', 'content.publish'))
    await store.save(receipt('r2', 'writer', 'content.publish'))
    await store.save(receipt('r3', 'security', 'content.delete'))

    expect((await store.list({ agentName: 'security' })).map((x) => x.id).sort()).toEqual([
      'r1',
      'r3',
    ])
    expect((await store.list({ toolName: 'content.delete' })).map((x) => x.id)).toEqual(['r3'])
  })

  it('markReverted sets revertedAt on the stored receipt', async () => {
    const store = createMemoryReceiptStore()
    await store.save(receipt('r1', 'security', 'content.publish'))

    await store.markReverted('r1', '2026-01-02T00:00:00.000Z')

    expect((await store.get('r1'))?.revertedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('markReverted on an unknown id throws RECEIPT_UNKNOWN', async () => {
    const store = createMemoryReceiptStore()
    await expect(store.markReverted('ghost', '2026-01-01T00:00:00.000Z')).rejects.toThrowError(
      /No receipt with id "ghost"/,
    )
  })
})
