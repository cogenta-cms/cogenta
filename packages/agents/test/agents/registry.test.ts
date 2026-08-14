import { describe, expect, it } from 'vitest'
import { createAgentRegistry } from '../../src/agents/registry.js'
import type { AgentDeclaration } from '../../src/agents/types.js'

function agent(name: string, overrides: Partial<AgentDeclaration> = {}): AgentDeclaration {
  return {
    name,
    identity: `./identities/${name}.md`,
    model: { preferred: 'claude-sonnet' },
    tools: [],
    ...overrides,
  }
}

describe('createAgentRegistry', () => {
  it('lists every registered agent', () => {
    const registry = createAgentRegistry([agent('security'), agent('seo')])
    expect(registry.list().map((a) => a.name)).toEqual(['security', 'seo'])
  })

  it('gets a declaration by name, and undefined for an unknown one', () => {
    const registry = createAgentRegistry([agent('security')])
    expect(registry.get('security')?.name).toBe('security')
    expect(registry.get('ghost')).toBeUndefined()
  })

  it('starts every agent enabled', () => {
    const registry = createAgentRegistry([agent('security')])
    expect(registry.isEnabled('security')).toBe(true)
    expect(registry.killSwitchFor('security').isActive()).toBe(false)
  })

  it('disable() flips the shared kill switch, stopping a run in progress', () => {
    const registry = createAgentRegistry([agent('security')])
    const killSwitch = registry.killSwitchFor('security')

    registry.disable('security')

    expect(registry.isEnabled('security')).toBe(false)
    expect(killSwitch.isActive()).toBe(true)
  })

  it('enable() re-arms a disabled agent', () => {
    const registry = createAgentRegistry([agent('security')])
    registry.disable('security')

    registry.enable('security')

    expect(registry.isEnabled('security')).toBe(true)
    expect(registry.killSwitchFor('security').isActive()).toBe(false)
  })

  it('throws AGENT_UNKNOWN for enable/disable/isEnabled/killSwitchFor on an unregistered name', () => {
    const registry = createAgentRegistry([])
    expect(() => registry.enable('ghost')).toThrowError(/No agent named "ghost"/)
    expect(() => registry.disable('ghost')).toThrowError(/No agent named "ghost"/)
    expect(() => registry.isEnabled('ghost')).toThrowError(/No agent named "ghost"/)
    expect(() => registry.killSwitchFor('ghost')).toThrowError(/No agent named "ghost"/)
  })

  it('validates the whole set’s sub-agent tool subsets at construction (task 11)', () => {
    expect(() =>
      createAgentRegistry([
        agent('security', { tools: ['deps.scan'], subagents: ['analyst'] }),
        agent('analyst', { tools: ['deps.scan', 'content.publish'] }),
      ]),
    ).toThrowError(/content\.publish/)
  })
})
