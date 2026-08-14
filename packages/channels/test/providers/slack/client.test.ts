import { isCogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createSlackClient } from '../../../src/providers/slack/client.js'

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('createSlackClient', () => {
  it('posts a message and returns the real Slack result', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, channel: 'C1', ts: '123.456' }),
    )
    const client = createSlackClient({ botToken: 't', fetchImpl })

    const result = await client.postMessage({ channel: 'C1', text: 'hi' })

    expect(result).toEqual({ channel: 'C1', ts: '123.456' })
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://slack.com/api/chat.postMessage')
    expect((init?.headers as Record<string, string>)?.authorization).toBe('Bearer t')
  })

  it('throws a typed CogentaError on a real Slack API failure', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { ok: false, error: 'channel_not_found' }),
    )
    const client = createSlackClient({ botToken: 't', fetchImpl })

    await expect(client.postMessage({ channel: 'bad', text: 'hi' })).rejects.toSatisfy((error) => {
      return isCogentaError(error) && error.code === 'CHANNEL_SLACK_API_ERROR'
    })
  })

  it("retries a 429 using Slack's Retry-After header, not a guessed backoff", async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) {
        return jsonResponse(429, { ok: false, error: 'rate_limited' }, { 'retry-after': '2' })
      }
      return jsonResponse(200, { ok: true, channel: 'C1', ts: '1' })
    })
    const sleepImpl = vi.fn(async (_ms: number) => {})
    const client = createSlackClient({ botToken: 't', fetchImpl, sleepImpl })

    const result = await client.postMessage({ channel: 'C1', text: 'hi' })

    expect(result).toEqual({ channel: 'C1', ts: '1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleepImpl).toHaveBeenCalledExactlyOnceWith(2000)
  })

  it('updates a message via chat.update', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://slack.com/api/chat.update')
      return jsonResponse(200, { ok: true, channel: 'C1', ts: '1' })
    })
    const client = createSlackClient({ botToken: 't', fetchImpl })

    await client.updateMessage({ channel: 'C1', ts: '1', text: 'edited' })

    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
