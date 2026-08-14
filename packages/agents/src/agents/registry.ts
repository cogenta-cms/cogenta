import { CogentaError } from '@cogenta/core'
import { createKillSwitch, type MutableKillSwitch } from '../budget/kill-switch.js'
import type { KillSwitch } from '../budget/types.js'
import { validateSubagentTools } from '../subagents/validate.js'
import type { AgentDeclaration } from './types.js'

export interface AgentRegistry {
  list(): readonly AgentDeclaration[]
  get(name: string): AgentDeclaration | undefined
  /** Re-enables a disabled agent — new runs may start; it does not affect what is already stopped. */
  enable(name: string): void
  /**
   * Disables an agent by flipping its shared kill switch — "désactiver un
   * agent l'arrête immédiatement, y compris un run en cours". Every
   * `runAgentLoop` call for this agent must be constructed with
   * `killSwitchFor(name)` as its `killSwitch` for that guarantee to hold;
   * this registry only owns the switch, not the runs themselves.
   */
  disable(name: string): void
  isEnabled(name: string): boolean
  /** The one `KillSwitch` instance shared by every run of this agent. */
  killSwitchFor(name: string): KillSwitch
}

function requireDeclaration(
  byName: ReadonlyMap<string, AgentDeclaration>,
  name: string,
): AgentDeclaration {
  const declaration = byName.get(name)
  if (declaration === undefined) {
    throw new CogentaError({
      code: 'AGENT_UNKNOWN',
      message: `No agent named "${name}" is registered.`,
      hint: 'Check the name against `list()`, or register the agent before referring to it.',
    })
  }
  return declaration
}

/**
 * "Format d'agent intégré, chargement, activation/désactivation" — loads a
 * fixed set of `AgentDeclaration`s, checked once at construction (task 11's
 * `validateSubagentTools`, since an `AgentDeclaration` is already a
 * structural `AgentToolsDeclaration`), and gives each one a dedicated,
 * shared kill switch for its enabled/disabled lifecycle. Every agent starts
 * enabled.
 */
export function createAgentRegistry(declarations: readonly AgentDeclaration[]): AgentRegistry {
  validateSubagentTools(declarations)

  const byName = new Map(declarations.map((declaration) => [declaration.name, declaration]))
  const killSwitches = new Map<string, MutableKillSwitch>(
    declarations.map((declaration) => [declaration.name, createKillSwitch(false)]),
  )

  function requireKillSwitch(name: string): MutableKillSwitch {
    requireDeclaration(byName, name)
    // Built from the same `declarations` this constructor validated above, so a
    // name that passed `requireDeclaration` always has a matching switch.
    return killSwitches.get(name) as MutableKillSwitch
  }

  return {
    list: () => declarations,
    get: (name) => byName.get(name),
    enable(name) {
      requireKillSwitch(name).deactivate()
    },
    disable(name) {
      requireKillSwitch(name).activate()
    },
    isEnabled(name) {
      return !requireKillSwitch(name).isActive()
    },
    killSwitchFor(name) {
      return requireKillSwitch(name)
    },
  }
}
