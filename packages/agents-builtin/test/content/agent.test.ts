import { describe, expect, it } from 'vitest'
import { contentAgent } from '../../src/content/agent.js'

describe('contentAgent', () => {
  it('never declares content.publish among its tools', () => {
    expect(contentAgent.tools).not.toContain('content.publish')
  })

  it('declares exactly the tools the design doc names', () => {
    expect(contentAgent.tools).toEqual([
      'content.read',
      'content.write_draft',
      'media.read',
      'agent.delegate',
    ])
  })

  it('turns on procedural memory, since human corrections are its main learning signal', () => {
    expect(contentAgent.memory?.procedural).toBe(true)
  })

  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(contentAgent)).toBe(true)
    expect(contentAgent.name).toBe('content')
  })
})
