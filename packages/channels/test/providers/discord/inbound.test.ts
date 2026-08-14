import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InboundCommand } from '../../../src/adapter.js'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import type { DiscordClient } from '../../../src/providers/discord/client.js'
import type { DiscordDispatchEvent } from '../../../src/providers/discord/gateway.js'
import { createDiscordInboundHandler } from '../../../src/providers/discord/inbound.js'
import { testDb } from '../../helpers/db.js'

function fakeClient(): DiscordClient & {
  readonly sent: Array<{ channelId: string; content: string }>
  readonly acked: Array<{ id: string; token: string }>
} {
  const sent: Array<{ channelId: string; content: string }> = []
  const acked: Array<{ id: string; token: string }> = []
  return {
    sent,
    acked,
    async sendMessage(params) {
      sent.push({ channelId: params.channelId, content: params.content ?? '' })
      return { channelId: params.channelId, messageId: 'M1' }
    },
    async updateMessage() {},
    async acknowledgeInteraction(id, token) {
      acked.push({ id, token })
    },
  }
}

function messageEvent(channelId: string, userId: string, content: string): DiscordDispatchEvent {
  return {
    type: 'MESSAGE_CREATE',
    data: { channel_id: channelId, author: { id: userId }, content },
  }
}

function componentEvent(channelId: string, userId: string, customId: string): DiscordDispatchEvent {
  return {
    type: 'INTERACTION_CREATE',
    data: {
      id: 'I1',
      token: 'tok1',
      type: 3,
      channel_id: channelId,
      member: { user: { id: userId } },
      data: { custom_id: customId },
    },
  }
}

describe('createDiscordInboundHandler', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('SECURITY: an unlinked identity gets no reply, even for an unrelated message', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const observed: InboundCommand[] = []
    const handleDispatch = createDiscordInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => (command) => {
        observed.push(command)
      },
    })

    await handleDispatch(messageEvent('C1', 'U999', 'hello there'))

    expect(client.sent).toEqual([])
    expect(observed).toHaveLength(1)
    expect(observed[0]?.identity.linkedUserId).toBeNull()
  })

  it('ignores its own bot messages', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const handleDispatch = createDiscordInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleDispatch({
      type: 'MESSAGE_CREATE',
      data: { channel_id: 'C1', author: { id: 'BOT1', bot: true }, content: 'hi' },
    })

    expect(client.sent).toEqual([])
  })

  it('links an identity on a valid code, then routes a real command through it', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'discord')
    const router = createCommandRouter({ getUserRoles: async () => ['editor'] })
    let handled = false
    router.register({
      name: 'ping',
      requiredRoles: [],
      handler: () => {
        handled = true
      },
    })
    const handleDispatch = createDiscordInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleDispatch(messageEvent('C1', 'U1', generated.code))
    expect(client.sent).toHaveLength(1)
    expect(client.sent[0]?.content).toContain('Compte lié')

    await handleDispatch(messageEvent('C1', 'U1', '/ping'))
    expect(handled).toBe(true)
  })

  it('acknowledges a component interaction, then routes it through the same authorization gate as a typed command', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'discord')
    await linkStore.verifyCode(generated.code, 'discord', 'U1')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    let receivedUserId: string | undefined
    router.register({
      name: 'approve',
      requiredRoles: ['admin'],
      handler: ({ userId }) => {
        receivedUserId = userId
      },
    })
    const handleDispatch = createDiscordInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleDispatch(componentEvent('C1', 'U1', 'approve TOKEN'))

    expect(client.acked).toEqual([{ id: 'I1', token: 'tok1' }])
    // Lacks the 'admin' role: refused, real user informed, handler not run.
    expect(receivedUserId).toBeUndefined()
    expect(client.sent[0]?.content).toContain('permission')
  })
})
