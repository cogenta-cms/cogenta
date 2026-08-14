import { describe, expect, it } from 'vitest'
import { createMemoryApprovalQueue } from '../../src/autonomy/approval-queue.js'

describe('createMemoryApprovalQueue', () => {
  it('request() resolves once decide() is called for the same id', async () => {
    const queue = createMemoryApprovalQueue({ newId: () => 'req-1' })

    const promise = queue.request({ agentName: 'security', toolName: 'deps.patch', input: {} })
    const [pending] = await queue.list('pending')
    expect(pending?.id).toBe('req-1')

    const decided = await queue.decide('req-1', 'approved', 'alice')
    const resolved = await promise

    expect(resolved).toEqual(decided)
    expect(resolved.status).toBe('approved')
    expect(resolved.decidedBy).toBe('alice')
  })

  it('carries a rejection reason through to the resolved request', async () => {
    const queue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    const promise = queue.request({ agentName: 'security', toolName: 'content.delete', input: {} })

    await queue.decide('req-1', 'rejected', 'alice', 'too risky')
    const resolved = await promise

    expect(resolved.status).toBe('rejected')
    expect(resolved.reason).toBe('too risky')
  })

  it('list() filters by status', async () => {
    const queue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    void queue.request({ agentName: 'security', toolName: 'x', input: {} })

    expect(await queue.list('pending')).toHaveLength(1)
    expect(await queue.list('approved')).toHaveLength(0)

    await queue.decide('req-1', 'approved', 'alice')

    expect(await queue.list('pending')).toHaveLength(0)
    expect(await queue.list('approved')).toHaveLength(1)
  })

  it('list() with no status returns every request regardless of state', async () => {
    const queue = createMemoryApprovalQueue({ newId: () => 'req-1' })
    void queue.request({ agentName: 'security', toolName: 'x', input: {} })

    expect(await queue.list()).toHaveLength(1)
  })

  it('decide() on an unknown id throws APPROVAL_REQUEST_UNKNOWN', async () => {
    const queue = createMemoryApprovalQueue()
    await expect(queue.decide('ghost', 'approved', 'alice')).rejects.toThrowError(
      /No approval request/,
    )
  })
})
