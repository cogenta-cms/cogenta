import { describe, expect, it } from 'vitest'
import type { ApprovalRequest } from '../../src/autonomy/types.js'
import { approvalToMemoryRecord } from '../../src/memory/from-approval.js'

function decidedRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-1',
    agentName: 'security',
    toolName: 'content.publish',
    input: { id: 'e1' },
    requestedAt: '2026-01-01T00:00:00.000Z',
    status: 'approved',
    decidedAt: '2026-01-01T00:05:00.000Z',
    decidedBy: 'alice',
    ...overrides,
  }
}

const PENDING_REQUEST: ApprovalRequest = {
  id: 'req-1',
  agentName: 'security',
  toolName: 'content.publish',
  input: { id: 'e1' },
  requestedAt: '2026-01-01T00:00:00.000Z',
  status: 'pending',
}

describe('approvalToMemoryRecord', () => {
  it('turns an approved request into a procedural record scoped to the site and agent', () => {
    const record = approvalToMemoryRecord(decidedRequest(), {
      siteId: 'acme-blog',
      newId: () => 'mem-1',
      now: () => new Date('2026-01-02T00:00:00.000Z').getTime(),
    })

    expect(record).toEqual({
      id: 'mem-1',
      type: 'procedural',
      siteId: 'acme-blog',
      agentName: 'security',
      content: JSON.stringify({
        toolName: 'content.publish',
        input: { id: 'e1' },
        status: 'approved',
        reason: undefined,
      }),
      createdAt: '2026-01-02T00:00:00.000Z',
      metadata: { approvalRequestId: 'req-1', decidedBy: 'alice' },
    })
  })

  it('carries a rejection’s reason as the learning signal', () => {
    const record = approvalToMemoryRecord(
      decidedRequest({ status: 'rejected', reason: 'wrong audience' }),
      { siteId: 'acme-blog' },
    )

    expect(JSON.parse(record.content)).toMatchObject({
      status: 'rejected',
      reason: 'wrong audience',
    })
  })

  it('throws AGENT_APPROVAL_NOT_DECIDED for a still-pending request', () => {
    expect(() => approvalToMemoryRecord(PENDING_REQUEST, { siteId: 'acme-blog' })).toThrowError(
      /has not been decided yet/,
    )
  })
})
