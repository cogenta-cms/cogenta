import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommandRouter } from '../../../src/inbound/router.js'
import { createChannelLinkStore } from '../../../src/linking/store.js'
import { createTelegramAdapter } from '../../../src/providers/telegram/adapter.js'
import { testDb } from '../../helpers/db.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createTelegramAdapter', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('reports honest capabilities: rich text and buttons, no threads, no attachments', () => {
    const adapter = createTelegramAdapter({
      token: 't',
      linkStore: createChannelLinkStore(db),
      router: createCommandRouter({ getUserRoles: async () => [] }),
      fetchImpl: vi.fn(),
    })

    expect(adapter.capabilities).toEqual({
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: true,
    })
  })

  it('send() renders the abstract message and returns a MessageId reusable by update()', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { text: string }
      expect(body.text).toContain('Build finished')
      return jsonResponse({ ok: true, result: { message_id: 7, chat: { id: 55 } } })
    })
    const adapter = createTelegramAdapter({
      token: 't',
      linkStore: createChannelLinkStore(db),
      router: createCommandRouter({ getUserRoles: async () => [] }),
      fetchImpl,
    })

    const id = await adapter.send({ id: '55' }, { level: 'notification', text: 'Build finished.' })

    expect(id).toBe('55:7')

    const editFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { chat_id: string; message_id: number }
      expect(body).toMatchObject({ chat_id: '55', message_id: 7 })
      return jsonResponse({ ok: true, result: true })
    })
    const adapterForUpdate = createTelegramAdapter({
      token: 't',
      linkStore: createChannelLinkStore(db),
      router: createCommandRouter({ getUserRoles: async () => [] }),
      fetchImpl: editFetch,
    })
    await adapterForUpdate.update?.(id, { level: 'notification', text: 'Build finished (edited).' })
    expect(editFetch).toHaveBeenCalledOnce()
  })

  it('verifyIdentity() runs the real linking-code verification and returns a linked identity', async () => {
    const linkStore = createChannelLinkStore(db)
    const { code } = await linkStore.generateCode('user-1', 'telegram')
    const adapter = createTelegramAdapter({
      token: 't',
      linkStore,
      router: createCommandRouter({ getUserRoles: async () => [] }),
      fetchImpl: vi.fn(),
    })

    const identity = await adapter.verifyIdentity({ code, channelUserId: '999' })

    expect(identity).toEqual({
      channelName: 'telegram',
      channelUserId: '999',
      linkedUserId: 'user-1',
    })
  })

  it('start()/stop() drive the polling loop, which delivers a real inbound update to onInbound', async () => {
    let getUpdatesCalls = 0
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/getUpdates')) {
        getUpdatesCalls += 1
        if (getUpdatesCalls === 1) {
          return jsonResponse({
            ok: true,
            result: [
              {
                update_id: 1,
                message: { message_id: 1, chat: { id: 1 }, from: { id: 999 }, text: 'hello' },
              },
            ],
          })
        }
        // A real long-poll blocks for up to `timeout` seconds when there is
        // nothing new — simulate that with a short real delay so the poll
        // loop can't spin unboundedly fast between the first update and
        // `stop()` being called below.
        await new Promise((resolve) => setTimeout(resolve, 20))
        return jsonResponse({ ok: true, result: [] })
      }
      return jsonResponse({ ok: true, result: { message_id: 1, chat: { id: 1 } } })
    })
    const adapter = createTelegramAdapter({
      token: 't',
      linkStore: createChannelLinkStore(db),
      router: createCommandRouter({ getUserRoles: async () => [] }),
      fetchImpl,
    })

    let received: string | undefined
    adapter.onInbound((command) => {
      received = command.text
    })

    adapter.start()
    await vi.waitFor(() => expect(received).toBe('hello'))
    await adapter.stop()
  })
})
