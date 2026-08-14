import { describe, expect, it } from 'vitest'
import type { ChannelIdentity } from '../../src/adapter.js'
import { createCommandRouter, parseCommand } from '../../src/inbound/router.js'

function identity(linkedUserId: string | null, channelUserId = 'chan-1'): ChannelIdentity {
  return { channelName: 'telegram', channelUserId, linkedUserId }
}

describe('parseCommand', () => {
  it('parses a leading-slash command with args', () => {
    expect(parseCommand('/approve 3f2c extra')).toEqual({
      name: 'approve',
      args: ['3f2c', 'extra'],
    })
  })

  it('parses a bare command name with no slash', () => {
    expect(parseCommand('status')).toEqual({ name: 'status', args: [] })
  })

  it('returns null for empty or whitespace-only text', () => {
    expect(parseCommand('')).toBeNull()
    expect(parseCommand('   ')).toBeNull()
  })
})

describe('createCommandRouter — security', () => {
  it('SECURITY: an unlinked identity gets no reply, even for a recognized command, and the handler never runs', async () => {
    let executed = false
    const router = createCommandRouter({ getUserRoles: async () => ['admin'] })
    router.register({
      name: 'approve',
      requiredRoles: [],
      handler: () => {
        executed = true
      },
    })

    const result = await router.route('/approve 1', identity(null))

    expect(result).toEqual({ kind: 'unlinked', shouldReply: false })
    expect(executed).toBe(false)
  })

  it('SECURITY: an unlinked identity gets no reply even for an UNRECOGNIZED command — no "unknown command" leak', async () => {
    const router = createCommandRouter({ getUserRoles: async () => [] })

    const result = await router.route('/does-not-exist', identity(null))

    expect(result).toEqual({ kind: 'unlinked', shouldReply: false })
  })

  it('SECURITY: permission escalation via the channel is refused — a linked user lacking the role cannot run the command', async () => {
    let executed = false
    const router = createCommandRouter({ getUserRoles: async () => ['viewer'] })
    router.register({
      name: 'approve',
      requiredRoles: ['admin', 'editor'],
      handler: () => {
        executed = true
      },
    })

    const result = await router.route('/approve 1', identity('user-1'))

    expect(result).toEqual({ kind: 'forbidden', shouldReply: true, userId: 'user-1' })
    expect(executed).toBe(false)
  })

  it('SECURITY: the acting userId cannot be spoofed via the inbound payload — the handler always receives the verified identity userId', async () => {
    let receivedUserId: string | undefined
    const router = createCommandRouter({ getUserRoles: async () => ['admin'] })
    router.register({
      name: 'approve',
      requiredRoles: ['admin'],
      handler: (input) => {
        receivedUserId = input.userId
      },
    })

    // The attacker puts a different id in the command text itself — it must
    // be ignored; only the verified `identity.linkedUserId` ever reaches the
    // handler.
    await router.route('/approve as-admin-user', identity('real-user-1', 'attacker-channel-id'))

    expect(receivedUserId).toBe('real-user-1')
  })

  it('a linked, authorized user successfully runs the command, and args are passed through', async () => {
    let capturedArgs: readonly string[] | undefined
    const router = createCommandRouter({ getUserRoles: async () => ['admin'] })
    router.register({
      name: 'approve',
      requiredRoles: ['admin'],
      handler: (input) => {
        capturedArgs = input.args
      },
    })

    const result = await router.route('/approve 3f2c', identity('user-1'))

    expect(result).toEqual({ kind: 'handled', shouldReply: false, userId: 'user-1' })
    expect(capturedArgs).toEqual(['3f2c'])
  })

  it('an unrecognized command from a LINKED user gets a reply naming the unknown command', async () => {
    const router = createCommandRouter({ getUserRoles: async () => [] })

    const result = await router.route('/nope', identity('user-1'))

    expect(result).toEqual({ kind: 'unrecognized', shouldReply: true, commandName: 'nope' })
  })

  it('registering the same command name twice throws a typed error', () => {
    const router = createCommandRouter({ getUserRoles: async () => [] })
    router.register({ name: 'status', requiredRoles: [], handler: () => {} })

    expect(() => router.register({ name: 'status', requiredRoles: [], handler: () => {} })).toThrow(
      /already registered/,
    )
  })
})
