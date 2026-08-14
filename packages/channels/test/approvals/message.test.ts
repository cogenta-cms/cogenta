import type { ApprovalRequest } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { renderApprovalMessage } from '../../src/approvals/message.js'

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-1',
    agentName: 'seoAgent',
    toolName: 'content.publish',
    input: { entryId: 'e1', collection: 'post' },
    requestedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}

describe('renderApprovalMessage', () => {
  it('renders an Alert-level message with the summarised input and admin link', () => {
    const message = renderApprovalMessage(request(), {
      adminUrl: 'https://admin.example/approvals/req-1',
      approveToken: 'APPROVETOKEN',
      denyToken: 'DENYTOKEN',
    })

    expect(message.level).toBe('alert')
    expect(message.title).toContain('content.publish')
    expect(message.context).toContain('seoAgent')
    expect(message.context).toContain('entryId')
    expect(message.adminUrl).toBe('https://admin.example/approvals/req-1')
  })

  it('encodes each token as a full, router-parseable command string, not the bare token', () => {
    const message = renderApprovalMessage(request(), {
      adminUrl: 'https://admin.example/approvals/req-1',
      approveToken: 'APPROVETOKEN',
      denyToken: 'DENYTOKEN',
    })

    expect(message.actions).toEqual([
      { id: 'approve APPROVETOKEN', label: 'Approuver' },
      { id: 'deny DENYTOKEN', label: 'Refuser' },
    ])
  })

  it('truncates a long input to stay within one screen', () => {
    const message = renderApprovalMessage(
      request({ input: { a: '1', b: '2', c: '3', d: '4', e: '5' } }),
      { adminUrl: 'https://admin.example', approveToken: 'A', denyToken: 'B' },
    )

    expect(message.context).toContain('…')
  })
})
