import { describe, expect, it } from 'vitest'
import { performanceAgent } from '../../src/performance/agent.js'

describe('performanceAgent', () => {
  it('never declares content.write_draft or content.publish', () => {
    expect(performanceAgent.tools).not.toContain('content.write_draft')
    expect(performanceAgent.tools).not.toContain('content.publish')
  })

  it('declares exactly the tools the design doc names', () => {
    expect(performanceAgent.tools).toEqual([
      'http.fetch',
      'content.read',
      'channel.send',
      'build.trigger',
    ])
  })

  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(performanceAgent)).toBe(true)
    expect(performanceAgent.name).toBe('performance')
  })
})
