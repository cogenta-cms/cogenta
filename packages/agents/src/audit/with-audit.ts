import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { AuditLogLike, AuditRecordInput } from './types.js'

export interface WithAuditOptions {
  readonly auditLog: AuditLogLike
  readonly agentName: string
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
  /** Injectable so tests never depend on real wall-clock duration. */
  readonly now?: () => number
  /** Pulls `{collection, entryId}` out of a tool's input when it touches content, so the entry links to the right one — absent for tools that don't (site.config_read, http.fetch). */
  readonly targetOf?: (input: Readonly<Record<string, unknown>>) => {
    readonly collection?: string
    readonly entryId?: string
  }
  /**
   * Called when `auditLog.record` itself fails. Never rethrown: ADR-0018's
   * own rule — "a write that fails must never fail the action it is
   * auditing" — applies here exactly as it did for L2's first writer.
   */
  readonly onAuditFailure?: (error: unknown) => void
}

/**
 * L4 task 6: "Tout appel [d'outil] produit une entrée d'audit : acteur,
 * agent, outil, entrée, sortie, diff, coût, durée." Wraps one
 * `ExecutableTool` so every call — success or failure — is recorded once it
 * resolves, never before: an entry that records only "attempted" and not
 * "what happened" is not the accountability this rule asks for.
 */
export function withAudit(tool: ExecutableTool, options: WithAuditOptions): ExecutableTool {
  const now = options.now ?? Date.now

  async function record(input: AuditRecordInput): Promise<void> {
    try {
      await options.auditLog.record(input)
    } catch (error) {
      options.onAuditFailure?.(error)
    }
  }

  return {
    spec: tool.spec,
    async execute(input: Readonly<Record<string, unknown>>, ctx: ToolExecutionContext) {
      const startedAt = now()
      const target = options.targetOf?.(input) ?? {}

      try {
        const output = await tool.execute(input, ctx)
        await record({
          actorId: options.actor.id,
          actorRoles: options.actor.roles,
          action: `agent.tool.${tool.spec.name}`,
          ...target,
          diff: {
            agent: options.agentName,
            tool: tool.spec.name,
            input,
            output,
            durationMs: now() - startedAt,
            ok: true,
          },
        })
        return output
      } catch (error) {
        await record({
          actorId: options.actor.id,
          actorRoles: options.actor.roles,
          action: `agent.tool.${tool.spec.name}`,
          ...target,
          diff: {
            agent: options.agentName,
            tool: tool.spec.name,
            input,
            durationMs: now() - startedAt,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        })
        throw error
      }
    },
  }
}

/** Applies `withAudit` to every tool in a manifest, so a caller does not have to remember to wrap each one individually. */
export function withAuditForManifest(
  tools: readonly ExecutableTool[],
  options: WithAuditOptions,
): readonly ExecutableTool[] {
  return tools.map((tool) => withAudit(tool, options))
}
