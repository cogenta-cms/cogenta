import { authHeader, request } from './http.js'

export interface AgentApprovalRequest {
  readonly id: string
  readonly agentName: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly requestedAt: string
  readonly status: 'pending' | 'approved' | 'rejected'
}

export function listAgentApprovals(token: string): Promise<readonly AgentApprovalRequest[]> {
  return request('/api/agent-approvals', { headers: authHeader(token) })
}

export function decideAgentApproval(
  token: string,
  id: string,
  decision: 'approve' | 'reject',
): Promise<AgentApprovalRequest> {
  return request(`/api/agent-approvals/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({}),
  })
}
