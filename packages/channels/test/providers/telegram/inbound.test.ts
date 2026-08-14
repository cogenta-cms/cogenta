import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InboundCommand } from '../../../src/adapter.js'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import type { TelegramClient, TelegramUpdate } from '../../../src/providers/telegram/client.js'
import { createTelegramInboundHandler } from '../../../src/providers/telegram/inbound.js'
import { testDb } from '../../helpers/db.js'

function fakeClient(): TelegramClient & {
  readonly sent: Array<{ chat_id: string; text: string }>
  readonly answered: string[]
} {
  const sent: Array<{ chat_id: string; text: string }> = []
  const answered: string[] = []
  return {
    sent,
    answered,
    async sendMessage(params) {
      sent.push({ chat_id: params.chat_id, text: params.text })
      return { message_id: sent.length, chat: { id: Number(params.chat_id) } }
    },
    async editMessageText() {},
    async answerCallbackQuery(id) {
      answered.push(id)
    },
    async getUpdates() {
      return []
    },
  }
}

function textUpdate(chatId: number, userId: number, text: string): TelegramUpdate {
  return {
    update_id: 1,
    message: { message_id: 1, chat: { id: chatId }, from: { id: userId }, text },
  }
}

function callbackUpdate(chatId: number, userId: number, data: string): TelegramUpdate {
  return {
    update_id: 2,
    callback_query: {
      id: 'cbq-1',
      from: { id: userId },
      message: { message_id: 5, chat: { id: chatId } },
      data,
    },
  }
}

describe('createTelegramInboundHandler', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('SECURITY: an unlinked identity sending an unrelated message gets no reply', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const observed: InboundCommand[] = []
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => (command) => {
        observed.push(command)
      },
    })

    await handleUpdate(textUpdate(1, 999, 'hello there'))

    expect(client.sent).toEqual([])
    expect(observed).toHaveLength(1)
    expect(observed[0]?.identity.linkedUserId).toBeNull()
  })

  it('an unlinked identity submitting a valid linking code gets linked and confirmed', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(textUpdate(1, 999, code))

    expect(client.sent).toHaveLength(1)
    expect(client.sent[0]?.text).toContain('lié')
    const identity = await linkStore.resolveIdentity('telegram', '999')
    expect(identity.linkedUserId).toBe('user-1')
  })

  it('an unlinked identity submitting a wrong code gets no reply either', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(textUpdate(1, 999, 'WRONGCODE'))

    expect(client.sent).toEqual([])
  })

  it('SECURITY: a linked user without the required role is refused, and told so', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    let executed = false
    router.register({
      name: 'approve',
      requiredRoles: ['content.publish'],
      handler: () => {
        executed = true
      },
    })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(textUpdate(1, 999, '/approve 42'))

    expect(executed).toBe(false)
    expect(client.sent).toHaveLength(1)
    expect(client.sent[0]?.text.toLowerCase()).toContain('permission')
  })

  it('a linked, authorized user runs the command as their own real userId', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')
    const router = createCommandRouter({ getUserRoles: async () => ['content.publish'] })
    let receivedUserId: string | undefined
    router.register({
      name: 'approve',
      requiredRoles: ['content.publish'],
      handler: (input) => {
        receivedUserId = input.userId
      },
    })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(textUpdate(1, 999, '/approve 42'))

    expect(receivedUserId).toBe('user-1')
  })

  it('a button press routes through the exact same authorization gate as a typed command', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')
    const router = createCommandRouter({ getUserRoles: async () => [] })
    let receivedUserId: string | undefined
    router.register({
      name: 'approve',
      requiredRoles: [],
      handler: (input) => {
        receivedUserId = input.userId
      },
    })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(callbackUpdate(1, 999, '/approve 42'))

    expect(receivedUserId).toBe('user-1')
    expect(client.answered).toEqual(['cbq-1'])
  })

  it('SECURITY: a button press from an unlinked identity is refused and dismisses the loading state without a reply', async () => {
    const client = fakeClient()
    const linkStore = createChannelLinkStore(db)
    const router = createCommandRouter({ getUserRoles: async () => [] })
    router.register({ name: 'approve', requiredRoles: [], handler: () => {} })
    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(callbackUpdate(1, 999, '/approve 42'))

    expect(client.sent).toEqual([])
    expect(client.answered).toEqual(['cbq-1'])
  })
})
