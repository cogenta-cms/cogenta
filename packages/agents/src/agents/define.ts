import { CogentaError } from '@cogenta/core'
import type { AgentDeclaration } from './types.js'

/**
 * Structural validation a type alone cannot enforce, mirroring `defineTool`
 * (task 4): a name and an identity document are load-bearing strings, not
 * decorative ones. Returns the declaration frozen, same reasoning as
 * `defineTool` — nothing downstream mutates a shared declaration.
 */
export function defineAgent(declaration: AgentDeclaration): AgentDeclaration {
  if (declaration.name.trim() === '') {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'An agent declares an empty name.',
      hint: 'Give the agent a stable, unique name.',
    })
  }
  if (declaration.identity.trim() === '') {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: `Agent "${declaration.name}" declares no identity document.`,
      hint: 'Point `identity` at the file describing this agent’s role, objectives and style.',
    })
  }

  return Object.freeze(declaration)
}
