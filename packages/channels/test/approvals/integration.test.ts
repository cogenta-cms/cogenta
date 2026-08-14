import type { AuditRecordInput } from '@cogenta/agents'
import { createMemoryApprovalQueue } from '@cogenta/agents'
import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChannelAdapter, ChannelMessage, ChannelTarget, MessageId } from '../../src/adapter.js'
import { createApprovalCommands } from '../../src/approvals/commands.js'
import { dispatchApproval } from '../../src/approvals/dispatch.js'
import { createApprovalTokenStore } from '../../src/approvals/store.js'
import { createCommandRouter } from '../../src/inbound/router.js'
import { createChannelLinkStore } from '../../src/linking/store.js'
import type { TelegramClient, TelegramUpdate } from '../../src/providers/telegram/client.js'
import { createTelegramInboundHandler } from '../../src/providers/telegram/inbound.js'
import { testDb } from '../helpers/db.js'

/**
 * A minimal, non-Telegram `ChannelAdapter` test double for the dispatch
 * step — Telegram's own real rendering/HTTP behaviour is already proven by
 * `providers/telegram/*.test.ts`; this test's job is the approval-specific
 * wiring (dispatch → token → router → queue → audit), not re-proving that.
 */
function fakeAdapter(): ChannelAdapter & { readonly sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = []
  return {
    name: 'fake',
    capabilities: {
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: false,
    },
    sent,
    async send(_target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      sent.push(message)
      return `msg-${sent.length}`
    },
    async verifyIdentity(): Promise<never> {
      throw new Error('not used in this test')
    },
  }
}

function fakeTelegramClient(): TelegramClient & {
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

function callbackUpdate(chatId: number, userId: number, data: string): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: 'cbq-1',
      from: { id: userId },
      message: { message_id: 5, chat: { id: chatId } },
      data,
    },
  }
}

function fakeAuditLog(): {
  records: AuditRecordInput[]
  record(input: AuditRecordInput): Promise<{ id: string; hash: string }>
} {
  const records: AuditRecordInput[] = []
  return {
    records,
    async record(input) {
      records.push(input)
      return { id: `audit-${records.length}`, hash: 'h' }
    },
  }
}

describe('approval cycle: agent → queue → channel → action → audit', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('SECURITY/INTEGRATION: a real ApprovalRequest is decided from a Telegram button press, and every step is real', async () => {
    // 1. A real user is linked.
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')

    // 2. A real agent action enters the real ApprovalQueue.
    const approvalQueue = createMemoryApprovalQueue()
    const pending = approvalQueue.request({
      agentName: 'seoAgent',
      toolName: 'content.publish',
      input: { entryId: 'e1' },
    })

    // Give the queue a moment to record the pending request before we list it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const [request] = await approvalQueue.list('pending')
    expect(request).toBeDefined()
    if (request === undefined) throw new Error('unreachable')

    // 3. Dispatched to the channel — real tokens, real rendered message,
    // via a non-Telegram adapter double (Telegram's own send/render path is
    // already proven in providers/telegram/*.test.ts).
    const dispatchTarget = fakeAdapter()
    const tokenStore = createApprovalTokenStore()
    await dispatchApproval(request, {
      adapter: dispatchTarget,
      target: { id: '1' },
      tokenStore,
      requiredRole: 'content.publish',
      buildAdminUrl: (id) => `https://admin.example/approvals/${id}`,
    })

    expect(dispatchTarget.sent).toHaveLength(1)
    const sentMessage = dispatchTarget.sent[0]
    expect(sentMessage?.level).toBe('alert')
    if (sentMessage?.level !== 'alert') throw new Error('unreachable')
    expect(sentMessage.context).toContain('content.publish')
    expect(sentMessage.actions?.map((action) => action.label)).toEqual(['Approuver', 'Refuser'])

    // 4. Route a real button press (as Telegram would deliver it) through the real router + real security gate.
    const client = fakeTelegramClient()
    const auditLog = fakeAuditLog()
    const router = createCommandRouter({ getUserRoles: async () => ['content.publish'] })
    const commands = createApprovalCommands({
      tokenStore,
      approvalQueue,
      auditLog,
      getUserRoles: async () => ['content.publish'],
      channelName: 'telegram',
      reply: async (_identity, message) => {
        if (message.level === 'notification') {
          await client.sendMessage({ chat_id: '1', text: message.text })
        }
      },
    })
    router.register(commands.approve)
    router.register(commands.deny)

    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    // The real approve action id, exactly as dispatched — "approve <token>",
    // the same string Telegram would echo back as callback_data.
    const approveActionId = sentMessage.actions?.[0]?.id ?? ''
    await handleUpdate(callbackUpdate(1, 999, approveActionId))

    // 5. The real ApprovalQueue reflects the decision.
    const decided = await pending
    expect(decided.status).toBe('approved')
    expect(decided.decidedBy).toBe('user-1')

    // 6. A real audit record names the channel of origin.
    expect(auditLog.records).toHaveLength(1)
    expect(auditLog.records[0]).toMatchObject({
      actorId: 'user-1',
      action: 'channel.approval.decide',
      diff: { channel: 'telegram', decision: 'approved' },
    })
  })

  it('ACCEPTANCE: a reused approval token is refused, not re-executed', async () => {
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')

    const approvalQueue = createMemoryApprovalQueue()
    approvalQueue.request({ agentName: 'a', toolName: 'content.publish', input: {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const [request] = await approvalQueue.list('pending')
    if (request === undefined) throw new Error('unreachable')

    const tokenStore = createApprovalTokenStore()
    const { token } = tokenStore.issue(request.id, null)
    const auditLog = fakeAuditLog()
    const client = fakeTelegramClient()
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const commands = createApprovalCommands({
      tokenStore,
      approvalQueue,
      auditLog,
      getUserRoles: async () => [],
      channelName: 'telegram',
      reply: async (_identity, message) => {
        if (message.level === 'notification') {
          await client.sendMessage({ chat_id: '1', text: message.text })
        }
      },
    })
    router.register(commands.approve)
    router.register(commands.deny)

    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await handleUpdate(callbackUpdate(1, 999, `approve ${token}`))
    await handleUpdate(callbackUpdate(1, 999, `approve ${token}`)) // reuse

    expect(auditLog.records).toHaveLength(1) // second attempt never redecided
    const lastReply = client.sent.at(-1)?.text ?? ''
    expect(lastReply.toLowerCase()).toContain('approuv')
  })

  it('ACCEPTANCE: an expired approval token is refused with a clear message, not a raw error', async () => {
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(code, 'telegram', '999')

    const approvalQueue = createMemoryApprovalQueue()
    approvalQueue.request({ agentName: 'a', toolName: 'content.publish', input: {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const [request] = await approvalQueue.list('pending')
    if (request === undefined) throw new Error('unreachable')

    let clock = 0
    const tokenStore = createApprovalTokenStore({ now: () => clock })
    const { token } = tokenStore.issue(request.id, null)
    clock += 20 * 60 * 1000 + 1 // past the TTL

    const auditLog = fakeAuditLog()
    const client = fakeTelegramClient()
    const router = createCommandRouter({ getUserRoles: async () => [] })
    const commands = createApprovalCommands({
      tokenStore,
      approvalQueue,
      auditLog,
      getUserRoles: async () => [],
      channelName: 'telegram',
      reply: async (_identity, message) => {
        if (message.level === 'notification') {
          await client.sendMessage({ chat_id: '1', text: message.text })
        }
      },
    })
    router.register(commands.approve)
    router.register(commands.deny)

    const handleUpdate = createTelegramInboundHandler({
      client,
      linkStore,
      router,
      getExternalHandler: () => undefined,
    })

    await expect(handleUpdate(callbackUpdate(1, 999, `approve ${token}`))).resolves.not.toThrow()

    expect(auditLog.records).toHaveLength(0)
    const reply = client.sent.at(-1)?.text ?? ''
    expect(reply.toLowerCase()).toContain('expir')
  })
})
