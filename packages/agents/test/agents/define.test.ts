import { describe, expect, it } from 'vitest'
import { defineAgent } from '../../src/agents/define.js'
import type { AgentDeclaration } from '../../src/agents/types.js'

function baseDeclaration(overrides: Partial<AgentDeclaration> = {}): AgentDeclaration {
  return {
    name: 'security',
    identity: './identities/security.md',
    model: { preferred: 'claude-sonnet', fallback: 'local' },
    tools: ['deps.scan', 'deps.patch', 'content.read', 'channel.send'],
    ...overrides,
  }
}

describe('defineAgent', () => {
  it('returns a frozen declaration for a valid agent', () => {
    const declaration = defineAgent(baseDeclaration())
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(declaration.name).toBe('security')
  })

  it('throws AGENT_DEFINITION_INVALID for an empty name', () => {
    expect(() => defineAgent(baseDeclaration({ name: '  ' }))).toThrowError(/empty name/)
  })

  it('throws AGENT_DEFINITION_INVALID for an empty identity path', () => {
    expect(() => defineAgent(baseDeclaration({ identity: '' }))).toThrowError(
      /declares no identity document/,
    )
  })

  it('accepts the full Contract C shape', () => {
    const declaration = defineAgent(
      baseDeclaration({
        skills: ['cve-triage', 'security-report'],
        subagents: ['dependency-analyst'],
        autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
        budget: { tokensPerDay: 200_000, eurPerMonth: 10, callsPerHour: 30 },
        memory: { episodic: true, semantic: true, procedural: true, scope: 'site' },
        triggers: [{ on: 'cve.published' }, { on: 'schedule', cron: '0 6 * * *' }],
      }),
    )

    expect(declaration.triggers).toHaveLength(2)
  })
})
