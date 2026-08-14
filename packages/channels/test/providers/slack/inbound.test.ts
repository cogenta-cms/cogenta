import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InboundCommand } from '../../../src/adapter.js'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import type { SlackClient } from '../../../src/providers/slack/client.js'
import { createSlackInboundHandler } from '../../../src/providers/slack/inbound.js'
import type { SlackSocketEnvelope } from '../../../src/providers/slack/socket.js'
import { testDb } from '../../helpers/db.js'

function fakeClient(): SlackClient & { readonly sent: Array<{ channel: string; text: string }> } {
  const sent: Array<{ channel: string; text: string }> = []
  return {
    sent,
    async postMessage(params) {
      sent.push({ channel: params.channel, text: params.text })
      return { channel: params.channel, ts: '1.1' }
    },
    async updateMessage() {},
  }
}

function messageEnvelope(channel: string, user: string, text: string): SlackSocketEnvelope {
  return {
    type: 'events_api',
    envelope_id: 'E1',
    payload: { type: 'event_callback', event: { type: 'message', channel, user, text } },
  }
}

function blockActionEnvelope(channel: string, user: string, value: string): SlackSocketEnvelope {
  return {
    type: 'interactive',
    envelope_id: 'E2',
    payload: {
      type: 'block_actions',
      user: { id: user },
      channel: { id: channel },
      actions: [{ action_id: value, value }],
    },
  }
}

describe('createSlackInboundHandler', () => {
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
    const handleEnvelope = createSlackInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => (command) => {
        observed.push(command)
      },
    })

    await handleEnvelope(messageEnvelope('C1', 'U999', 'hello there'))

    expect(client.sent).toEqual([])
    expect(observed).toHaveLength(1)
    expect(observed[0]?.identity.linkedUserId).toBeNull()
  })

  it('links an identity on a valid code, then routes a real command through it', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'slack')
    const router = createCommandRouter({ getUserRoles: async () => ['editor'] })
    let handled = false
    router.register({
      name: 'ping',
      requiredRoles: [],
      handler: () => {
        handled = true
      },
    })
    const handleEnvelope = createSlackInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleEnvelope(messageEnvelope('C1', 'U1', generated.code))
    expect(client.sent).toHaveLength(1)
    expect(client.sent[0]?.text).toContain('Compte lié')

    await handleEnvelope(messageEnvelope('C1', 'U1', '/ping'))
    expect(handled).toBe(true)
  })

  it('routes a block-action button press through the same authorization gate as a typed command', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'slack')
    await linkStore.verifyCode(generated.code, 'slack', 'U1')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    let receivedUserId: string | undefined
    router.register({
      name: 'approve',
      requiredRoles: ['admin'],
      handler: ({ userId }) => {
        receivedUserId = userId
      },
    })
    const handleEnvelope = createSlackInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleEnvelope(blockActionEnvelope('C1', 'U1', 'approve TOKEN'))

    // Lacks the 'admin' role: refused, real user informed, handler not run.
    expect(receivedUserId).toBeUndefined()
    expect(client.sent[0]?.text).toContain('permission')
  })
})
