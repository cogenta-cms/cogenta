import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNotification } from '../../../src/formats/notification.js'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import { createDiscordAdapter } from '../../../src/providers/discord/adapter.js'
import type {
  DiscordDispatchEvent,
  DiscordGatewayClient,
} from '../../../src/providers/discord/gateway.js'
import { testDb } from '../../helpers/db.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function fakeGatewayClient(): DiscordGatewayClient & {
  deliver(event: DiscordDispatchEvent): Promise<void>
  connected: boolean
} {
  let handler: ((event: DiscordDispatchEvent) => Promise<void>) | undefined
  return {
    connected: false,
    async connect(onDispatch) {
      handler = onDispatch
      this.connected = true
    },
    disconnect() {
      this.connected = false
    },
    async deliver(event) {
      if (handler !== undefined) await handler(event)
    },
  }
}

describe('createDiscordAdapter', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('declares honest capabilities: rich text, buttons and inbound, no threads/attachments', () => {
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createDiscordAdapter({
      botToken: 't',
      linkStore,
      router,
      gatewayClient: fakeGatewayClient(),
    })

    expect(adapter.name).toBe('discord')
    expect(adapter.capabilities).toEqual({
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: true,
    })
  })

  it('sends a message through the real Discord REST API and returns a channelId:messageId message id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'M1', channel_id: 'C1' }))
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createDiscordAdapter({
      botToken: 't',
      fetchImpl,
      linkStore,
      router,
      gatewayClient: fakeGatewayClient(),
    })

    const messageId = await adapter.send({ id: 'C1' }, buildNotification('Deployed.'))

    expect(messageId).toBe('C1:M1')
  })

  it('verifies identity through the real link store', async () => {
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'discord')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createDiscordAdapter({
      botToken: 't',
      linkStore,
      router,
      gatewayClient: fakeGatewayClient(),
    })

    const identity = await adapter.verifyIdentity({ code: generated.code, channelUserId: 'U1' })

    expect(identity.linkedUserId).toBe('user-1')
  })

  it('rejects an identity proof that is not { code, channelUserId }', async () => {
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createDiscordAdapter({
      botToken: 't',
      linkStore,
      router,
      gatewayClient: fakeGatewayClient(),
    })

    await expect(adapter.verifyIdentity({})).rejects.toThrow(/proof/)
  })

  it('start()/stop() drive the gateway client lifecycle', async () => {
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const gatewayClient = fakeGatewayClient()
    const adapter = createDiscordAdapter({
      botToken: 't',
      linkStore,
      router,
      gatewayClient,
    })

    await adapter.start()
    expect(gatewayClient.connected).toBe(true)
    adapter.stop()
    expect(gatewayClient.connected).toBe(false)
  })

  it('SECURITY: an unlinked identity that presses a button gets no reply', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, {}),
    )
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    router.register({ name: 'approve', requiredRoles: [], handler: () => {} })
    const gatewayClient = fakeGatewayClient()
    const adapter = createDiscordAdapter({
      botToken: 't',
      fetchImpl,
      linkStore,
      router,
      gatewayClient,
    })

    await adapter.start()
    await gatewayClient.deliver({
      type: 'INTERACTION_CREATE',
      data: {
        id: 'I1',
        token: 'tok1',
        type: 3,
        channel_id: 'C1',
        member: { user: { id: 'U-stranger' } },
        data: { custom_id: 'approve TOKEN' },
      },
    })

    // The interaction is still acked (Discord requires it regardless of
    // authorization, or the button shows "This interaction failed") — but
    // no follow-up message is ever sent to a stranger.
    const sentMessageCalls = fetchImpl.mock.calls.filter(([url]) =>
      String(url).includes('/messages'),
    )
    expect(sentMessageCalls).toHaveLength(0)
  })
})
