/** Contract C's four levels, settable per agent and per tool (`defineAgent`'s `autonomy: { default, 'tool.name': level }`). */
export type AutonomyLevel = 'observe' | 'propose' | 'execute_with_approval' | 'autonomous'

export interface AutonomyConfig {
  readonly default: AutonomyLevel
  /** Per-tool overrides, keyed by tool name. */
  readonly overrides?: Readonly<Record<string, AutonomyLevel>>
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRequest {
  readonly id: string
  readonly agentName: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly requestedAt: string
  readonly status: ApprovalStatus
  readonly decidedAt?: string
  readonly decidedBy?: string
  readonly reason?: string
}

export interface ApprovalRequestInput {
  readonly agentName: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
}

/**
 * "La file d'approbation est consultable dans l'admin et actionnable depuis
 * un canal (L6)" — this is the queue those surfaces will read and act on;
 * building the admin/channel UI for it is later work, not this task's.
 */
export interface ApprovalQueue {
  /** Creates a pending request and resolves once a human decides it. */
  request(input: ApprovalRequestInput): Promise<ApprovalRequest>
  list(status?: ApprovalStatus): Promise<readonly ApprovalRequest[]>
  decide(
    id: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest>
}
