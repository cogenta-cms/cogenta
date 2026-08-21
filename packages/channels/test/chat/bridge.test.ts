import { describe, expect, it } from 'vitest'
import type { ChannelIdentity, NotificationChannelMessage } from '../../src/adapter.js'
import { createAgentChatBridge, formatChatReply } from '../../src/chat/bridge.js'
import { createCommandRouter } from '../../src/inbound/router.js'

function identity(linkedUserId: string | null): ChannelIdentity {
  return { channelName: 'telegram', channelUserId: 'chan-1', linkedUserId }
}

describe('formatChatReply', () => {
  it('flattens newlines to a single line', () => {
    const reply = formatChatReply('line one\nline two\n\nline three')
    expect(reply.text).toBe('line one line two line three')
    expect(reply.text.includes('\n')).toBe(false)
  })

  it('truncates a long answer to the screen budget with an ellipsis', () => {
    const reply = formatChatReply('x'.repeat(1000))
    expect(reply.text.length).toBeLessThanOrEqual(480)
    expect(reply.text.endsWith('…')).toBe(true)
  })

  it('falls back to a placeholder for an empty answer', () => {
    expect(formatChatReply('   ').text).toBe('(no response)')
  })
})

describe('createAgentChatBridge', () => {
  function setup(overrides: { runError?: Error } = {}) {
    const sent: { identity: ChannelIdentity; message: NotificationChannelMessage }[] = []
    const runCalls: { name: string; instruction: string; trigger: string | undefined }[] = []
    const bridge = createAgentChatBridge({
      runner: {
        async run(name, instruction, trigger) {
          runCalls.push({ name, instruction, trigger })
          if (overrides.runError !== undefined) throw overrides.runError
          return { finalText: `you said: ${instruction}` }
        },
      },
      agents: { has: (name) => name === 'Support Bot' },
      defaultAgentName: 'Cogenta Agent',
      getUserRoles: async () => ['admin'],
      reply: async (identity, message) => {
        sent.push({ identity, message })
      },
      channelName: 'telegram',
    })
    const router = createCommandRouter({ getUserRoles: async () => ['admin'], chat: bridge })
    return { router, sent, runCalls }
  }

  it('SECURITY: never invoked for an unlinked identity', async () => {
    const { router, sent, runCalls } = setup()
    await router.route('hello', identity(null))
    expect(sent).toHaveLength(0)
    expect(runCalls).toHaveLength(0)
  })

  it('SECURITY: a linked user without the required role is refused before the runner is ever called', async () => {
    const sent: unknown[] = []
    const runCalls: unknown[] = []
    const bridge = createAgentChatBridge({
      runner: {
        run: async (...args) => {
          runCalls.push(args)
          return { finalText: 'x' }
        },
      },
      agents: { has: () => false },
      defaultAgentName: 'Cogenta Agent',
      getUserRoles: async () => ['viewer'],
      reply: async () => {
        sent.push(1)
      },
      channelName: 'telegram',
    })
    const router = createCommandRouter({ getUserRoles: async () => ['viewer'], chat: bridge })

    const result = await router.route('hello', identity('user-1'))

    expect(result).toEqual({ kind: 'forbidden', shouldReply: true, userId: 'user-1' })
    expect(runCalls).toHaveLength(0)
  })

  it('routes a plain message to the default agent and replies with its finalText', async () => {
    const { router, sent, runCalls } = setup()
    await router.route('how many orders today?', identity('user-1'))

    expect(runCalls).toEqual([
      { name: 'Cogenta Agent', instruction: 'how many orders today?', trigger: 'channel:telegram' },
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.message.text).toBe('you said: how many orders today?')
  })

  it('routes an "@Agent Name: message" mention to the named agent when it exists', async () => {
    const { router, runCalls } = setup()
    await router.route('@Support Bot: reset my password', identity('user-1'))

    expect(runCalls).toEqual([
      { name: 'Support Bot', instruction: 'reset my password', trigger: 'channel:telegram' },
    ])
  })

  it('falls back to the default agent, with a warning, for an unknown mention', async () => {
    const { router, sent, runCalls } = setup()
    await router.route('@Nobody: do something', identity('user-1'))

    expect(runCalls).toEqual([
      { name: 'Cogenta Agent', instruction: 'do something', trigger: 'channel:telegram' },
    ])
    // One warning reply about the unknown mention, then the real answer.
    expect(sent).toHaveLength(2)
    expect(sent[0]?.message.text).toMatch(/Unknown agent "Nobody"/)
  })

  it('replies with the error message rather than throwing when the agent run fails (e.g. AGENT_NO_PROVIDER)', async () => {
    const { sent, runCalls } = setup()
    const failing = createAgentChatBridge({
      runner: {
        run: async () => {
          throw new Error('boom')
        },
      },
      agents: { has: () => false },
      defaultAgentName: 'Cogenta Agent',
      getUserRoles: async () => ['admin'],
      reply: async (identity, message) => {
        sent.push({ identity, message })
      },
      channelName: 'telegram',
    })
    const failingRouter = createCommandRouter({
      getUserRoles: async () => ['admin'],
      chat: failing,
    })

    await failingRouter.route('hello', identity('user-1'))

    expect(sent.at(-1)?.message.text).toBe('The agent could not complete this request.')
    expect(runCalls).toHaveLength(0)
  })

  it('replies with usage guidance for an empty message', async () => {
    const { router, sent } = setup()
    await router.route('@Support Bot:    ', identity('user-1'))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.message.text).toMatch(/Send a message/)
  })
})
