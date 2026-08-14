import { describe, expect, it } from 'vitest'
import type { AgentToolsDeclaration } from '../../src/subagents/types.js'
import { validateSubagentTools } from '../../src/subagents/validate.js'

describe('validateSubagentTools', () => {
  it('accepts a sub-agent whose tools are a subset of its parent’s', () => {
    const agents: AgentToolsDeclaration[] = [
      {
        name: 'security',
        tools: ['deps.scan', 'deps.patch', 'content.read'],
        subagents: ['dependency-analyst'],
      },
      { name: 'dependency-analyst', tools: ['deps.scan', 'content.read'] },
    ]

    expect(() => validateSubagentTools(agents)).not.toThrow()
  })

  it('accepts an agent with no subagents at all', () => {
    expect(() => validateSubagentTools([{ name: 'security', tools: ['deps.scan'] }])).not.toThrow()
  })

  it('throws AGENT_SUBAGENT_UNKNOWN when the named sub-agent is not in the set', () => {
    const agents: AgentToolsDeclaration[] = [
      { name: 'security', tools: ['deps.scan'], subagents: ['ghost'] },
    ]

    expect(() => validateSubagentTools(agents)).toThrowError(/"ghost"/)
  })

  it('throws AGENT_SUBAGENT_TOOLS_NOT_SUBSET when the sub-agent has an extra tool', () => {
    const agents: AgentToolsDeclaration[] = [
      { name: 'security', tools: ['deps.scan'], subagents: ['dependency-analyst'] },
      { name: 'dependency-analyst', tools: ['deps.scan', 'content.publish'] },
    ]

    expect(() => validateSubagentTools(agents)).toThrowError(/content\.publish/)
  })

  it('reports every excess tool, not just the first', () => {
    const agents: AgentToolsDeclaration[] = [
      { name: 'security', tools: [], subagents: ['dependency-analyst'] },
      { name: 'dependency-analyst', tools: ['deps.scan', 'content.publish'] },
    ]

    expect(() => validateSubagentTools(agents)).toThrowError(/deps\.scan, content\.publish/)
  })
})
