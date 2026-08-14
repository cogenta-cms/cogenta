import { isCogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createDiscordClient } from '../../../src/providers/discord/client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createDiscordClient', () => {
  it('sends a message and returns the real Discord result', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { id: 'M1', channel_id: 'C1' }),
    )
    const client = createDiscordClient({ botToken: 't', fetchImpl })

    const result = await client.sendMessage({ channelId: 'C1', content: 'hi' })

    expect(result).toEqual({ channelId: 'C1', messageId: 'M1' })
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://discord.com/api/v10/channels/C1/messages')
    expect((init?.headers as Record<string, string>)?.authorization).toBe('Bot t')
  })

  it('throws a typed CogentaError on a real Discord API failure', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(404, { message: 'Unknown Channel', code: 10003 }),
    )
    const client = createDiscordClient({ botToken: 't', fetchImpl })

    await expect(client.sendMessage({ channelId: 'bad', content: 'hi' })).rejects.toSatisfy(
      (error) => isCogentaError(error) && error.code === 'CHANNEL_DISCORD_API_ERROR',
    )
  })

  it("retries a 429 using Discord's real retry_after (seconds, float), not a guessed backoff", async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) return jsonResponse(429, { retry_after: 1.5, global: false })
      return jsonResponse(200, { id: 'M1', channel_id: 'C1' })
    })
    const sleepImpl = vi.fn(async (_ms: number) => {})
    const client = createDiscordClient({ botToken: 't', fetchImpl, sleepImpl })

    const result = await client.sendMessage({ channelId: 'C1', content: 'hi' })

    expect(result).toEqual({ channelId: 'C1', messageId: 'M1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleepImpl).toHaveBeenCalledExactlyOnceWith(1500)
  })

  it('updates a message via PATCH', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://discord.com/api/v10/channels/C1/messages/M1')
      expect(init?.method).toBe('PATCH')
      return new Response(null, { status: 204 })
    })
    const client = createDiscordClient({ botToken: 't', fetchImpl })

    await client.updateMessage({ channelId: 'C1', messageId: 'M1', content: 'edited' })

    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('acknowledges an interaction with a deferred update (type 6)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://discord.com/api/v10/interactions/I1/tok1/callback')
      expect(JSON.parse(String(init?.body))).toEqual({ type: 6 })
      return new Response(null, { status: 204 })
    })
    const client = createDiscordClient({ botToken: 't', fetchImpl })

    await client.acknowledgeInteraction('I1', 'tok1')

    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
