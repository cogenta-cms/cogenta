import { describe, expect, it } from 'vitest'
import { createKillSwitch } from '../../src/budget/kill-switch.js'

describe('createKillSwitch', () => {
  it('starts inactive by default', () => {
    expect(createKillSwitch().isActive()).toBe(false)
  })

  it('can start active', () => {
    expect(createKillSwitch(true).isActive()).toBe(true)
  })

  it('activate() and deactivate() flip the state', () => {
    const killSwitch = createKillSwitch()
    killSwitch.activate()
    expect(killSwitch.isActive()).toBe(true)
    killSwitch.deactivate()
    expect(killSwitch.isActive()).toBe(false)
  })
})
