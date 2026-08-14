import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNotification } from '../../../src/formats/notification.js'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import { createSlackAdapter } from '../../../src/providers/slack/adapter.js'
import type { SlackSocketClient, SlackSocketEnvelope } from '../../../src/providers/slack/socket.js'
import { testDb } from '../../helpers/db.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function fakeSocketClient(): SlackSocketClient & {
  deliver(envelope: SlackSocketEnvelope): Promise<void>
  connected: boolean
} {
  let handler: ((envelope: SlackSocketEnvelope) => Promise<void>) | undefined
  return {
    connected: false,
    async connect(onEnvelope) {
      handler = onEnvelope
      this.connected = true
    },
    disconnect() {
      this.connected = false
    },
    async deliver(envelope) {
      if (handler !== undefined) await handler(envelope)
    },
  }
}

describe('createSlackAdapter', () => {
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
    const adapter = createSlackAdapter({
      botToken: 't',
      appToken: 'xapp',
      linkStore,
      router,
      socketClient: fakeSocketClient(),
    })

    expect(adapter.name).toBe('slack')
    expect(adapter.capabilities).toEqual({
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: true,
    })
  })

  it('sends a message through the real Slack Web API and returns a channel:ts message id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, channel: 'C1', ts: '9.9' }))
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createSlackAdapter({
      botToken: 't',
      appToken: 'xapp',
      fetchImpl,
      linkStore,
      router,
      socketClient: fakeSocketClient(),
    })

    const messageId = await adapter.send({ id: 'C1' }, buildNotification('Deployed.'))

    expect(messageId).toBe('C1:9.9')
  })

  it('verifies identity through the real link store', async () => {
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'slack')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createSlackAdapter({
      botToken: 't',
      appToken: 'xapp',
      linkStore,
      router,
      socketClient: fakeSocketClient(),
    })

    const identity = await adapter.verifyIdentity({ code: generated.code, channelUserId: 'U1' })

    expect(identity.linkedUserId).toBe('user-1')
  })

  it('rejects an identity proof that is not { code, channelUserId }', async () => {
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const adapter = createSlackAdapter({
      botToken: 't',
      appToken: 'xapp',
      linkStore,
      router,
      socketClient: fakeSocketClient(),
    })

    await expect(adapter.verifyIdentity({})).rejects.toThrow(/proof/)
  })

  it('start()/stop() drive the socket client lifecycle', async () => {
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const socketClient = fakeSocketClient()
    const adapter = createSlackAdapter({
      botToken: 't',
      appToken: 'xapp',
      linkStore,
      router,
      socketClient,
    })

    await adapter.start()
    expect(socketClient.connected).toBe(true)
    adapter.stop()
    expect(socketClient.connected).toBe(false)
  })
})
