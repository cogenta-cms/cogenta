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

describe('createCommandRouter — chat fallback (L22 task 2)', () => {
  it('with no chat option configured, an unmatched message still falls back to "unrecognized" (unchanged pre-L22 behaviour)', async () => {
    const router = createCommandRouter({ getUserRoles: async () => ['admin'] })

    const result = await router.route('create a menu with starters and mains', identity('user-1'))

    expect(result).toEqual({ kind: 'unrecognized', shouldReply: true, commandName: 'create' })
  })

  it('a message that matches no registered command name is handed to the chat handler with the raw, un-reparsed text', async () => {
    let received: { text: string; userId: string } | undefined
    const router = createCommandRouter({
      getUserRoles: async () => ['admin'],
      chat: {
        requiredRoles: ['admin'],
        handler: ({ text, userId }) => {
          received = { text, userId }
        },
      },
    })

    const result = await router.route('create a menu with starters and mains', identity('user-1'))

    expect(result).toEqual({ kind: 'handled', shouldReply: false, userId: 'user-1' })
    expect(received).toEqual({ text: 'create a menu with starters and mains', userId: 'user-1' })
  })

  it('a registered command still takes priority over the chat fallback', async () => {
    let commandRan = false
    let chatRan = false
    const router = createCommandRouter({
      getUserRoles: async () => ['admin'],
      chat: {
        requiredRoles: ['admin'],
        handler: () => {
          chatRan = true
        },
      },
    })
    router.register({
      name: 'approve',
      requiredRoles: [],
      handler: () => {
        commandRan = true
      },
    })

    await router.route('/approve 1', identity('user-1'))

    expect(commandRan).toBe(true)
    expect(chatRan).toBe(false)
  })

  it('SECURITY: an unlinked identity gets no reply and the chat handler never runs, even with a chat fallback configured', async () => {
    let chatRan = false
    const router = createCommandRouter({
      getUserRoles: async () => ['admin'],
      chat: {
        requiredRoles: [],
        handler: () => {
          chatRan = true
        },
      },
    })

    const result = await router.route('hello', identity(null))

    expect(result).toEqual({ kind: 'unlinked', shouldReply: false })
    expect(chatRan).toBe(false)
  })

  it('SECURITY: a linked user lacking the chat role is refused, not routed to the agent', async () => {
    let chatRan = false
    const router = createCommandRouter({
      getUserRoles: async () => ['viewer'],
      chat: {
        requiredRoles: ['admin'],
        handler: () => {
          chatRan = true
        },
      },
    })

    const result = await router.route('hello', identity('user-1'))

    expect(result).toEqual({ kind: 'forbidden', shouldReply: true, userId: 'user-1' })
    expect(chatRan).toBe(false)
  })
})
