import { isCogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createTelegramClient } from '../../../src/providers/telegram/client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createTelegramClient', () => {
  it('sends a message and returns the real Telegram result', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, result: { message_id: 42, chat: { id: 100 } } }),
    )
    const client = createTelegramClient({ token: 't', fetchImpl })

    const result = await client.sendMessage({ chat_id: '100', text: 'hi' })

    expect(result).toEqual({ message_id: 42, chat: { id: 100 } })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.telegram.org/bott/sendMessage')
  })

  it('throws a typed CogentaError on a real Telegram API failure', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { ok: false, error_code: 400, description: 'chat not found' }),
    )
    const client = createTelegramClient({ token: 't', fetchImpl })

    await expect(client.sendMessage({ chat_id: 'bad', text: 'hi' })).rejects.toSatisfy((error) => {
      return isCogentaError(error) && error.code === 'CHANNEL_TELEGRAM_API_ERROR'
    })
  })

  it("retries a 429 using Telegram's own retry_after value, not a guessed backoff", async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) {
        return jsonResponse(429, {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 3 },
        })
      }
      return jsonResponse(200, { ok: true, result: { message_id: 1, chat: { id: 1 } } })
    })
    const sleepImpl = vi.fn(async (_ms: number) => {})
    const client = createTelegramClient({ token: 't', fetchImpl, sleepImpl })

    const result = await client.sendMessage({ chat_id: '1', text: 'hi' })

    expect(result).toEqual({ message_id: 1, chat: { id: 1 } })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleepImpl).toHaveBeenCalledExactlyOnceWith(3000)
  })

  it('paginates getUpdates with the given offset and long-poll timeout', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { offset: number; timeout: number }
      expect(body).toEqual({ offset: 7, timeout: 30 })
      return jsonResponse(200, { ok: true, result: [] })
    })
    const client = createTelegramClient({ token: 't', fetchImpl })

    const updates = await client.getUpdates(7, 30)

    expect(updates).toEqual([])
  })
})
