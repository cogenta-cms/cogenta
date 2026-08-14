/**
 * The one slice of `defineAgent` (Contract C) task 11 actually needs: enough
 * to check `subagent.tools ⊆ parent.tools` before anything runs. The rest of
 * an agent's declaration (identity, model, skills, autonomy, budget, memory,
 * triggers) belongs to later tasks and is deliberately not modelled here.
 */
export interface AgentToolsDeclaration {
  readonly name: string
  readonly tools: readonly string[]
  /** Names of other declarations in the same set this agent may delegate to. */
  readonly subagents?: readonly string[]
}
