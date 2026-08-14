import { describe, expect, it } from 'vitest'
import { securityAgent } from '../../src/security/agent.js'

describe('securityAgent', () => {
  it('grants deps.scan and deps.patch, among the tools the design doc names', () => {
    expect(securityAgent.tools).toEqual(
      expect.arrayContaining(['deps.scan', 'deps.patch', 'content.read', 'channel.send']),
    )
  })

  it('makes deps.scan autonomous while leaving deps.patch at the propose default', () => {
    expect(securityAgent.autonomy?.default).toBe('propose')
    expect(securityAgent.autonomy?.overrides?.['deps.scan']).toBe('autonomous')
    expect(securityAgent.autonomy?.overrides?.['deps.patch']).toBeUndefined()
  })

  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(securityAgent)).toBe(true)
    expect(securityAgent.name).toBe('security')
  })
})
