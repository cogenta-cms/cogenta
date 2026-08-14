import type { KillSwitch } from './types.js'

export interface MutableKillSwitch extends KillSwitch {
  activate(): void
  deactivate(): void
}

/**
 * An explicit, human-flipped stop — independent of budgets, which trip on
 * their own from measured usage. Shared across every run for the same
 * agent (construct once, pass the same instance into every `runAgentLoop`
 * call for that agent) so flipping it stops the next step of *every*
 * in-flight run, not just new ones.
 */
export function createKillSwitch(initial = false): MutableKillSwitch {
  let active = initial
  return {
    isActive: () => active,
    activate: () => {
      active = true
    },
    deactivate: () => {
      active = false
    },
  }
}
