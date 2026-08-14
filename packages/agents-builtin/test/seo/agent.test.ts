import { describe, expect, it } from 'vitest'
import { seoAgent } from '../../src/seo/agent.js'

describe('seoAgent', () => {
  it('never declares content.publish among its tools', () => {
    expect(seoAgent.tools).not.toContain('content.publish')
  })

  it('declares content.write_draft, so it can propose but not publish', () => {
    expect(seoAgent.tools).toContain('content.write_draft')
  })

  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(seoAgent)).toBe(true)
    expect(seoAgent.name).toBe('seo')
  })
})
