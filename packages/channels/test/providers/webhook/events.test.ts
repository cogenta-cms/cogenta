import { describe, expect, it } from 'vitest'
import type { WebhookFetch } from '../../../src/providers/webhook/adapter.js'
import {
  createWebhookEventSender,
  type WebhookEventEnvelope,
} from '../../../src/providers/webhook/events.js'
import {
  verifyIncomingWebhook,
  WebhookReplayGuard,
} from '../../../src/providers/webhook/signing.js'

const SECRET = 'shared-webhook-secret'

interface Captured {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

function recorder(status = 200): { readonly calls: Captured[]; readonly fetchImpl: WebhookFetch } {
  const calls: Captured[] = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body })
      return { ok: status >= 200 && status < 300, status }
    },
  }
}

describe('outbound content-lifecycle webhooks', () => {
  it('sends a signed request the existing verifier accepts unchanged', async () => {
    const { calls, fetchImpl } = recorder()
    const now = () => 1_700_000_000_000
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl,
      now,
    })

    const results = await sender.send('content.publish', { collection: 'page', id: 'abc' })

    expect(results).toEqual([
      { url: 'https://receiver.example/hook', delivered: true, status: 200 },
    ])
    const call = calls[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    // The receiver's own verification path, argument for argument — no
    // second signature scheme exists for events.
    const verdict = verifyIncomingWebhook({
      headers: {
        timestamp: call.headers['X-Cogenta-Timestamp'] ?? '',
        signature: call.headers['X-Cogenta-Signature'] ?? '',
      },
      rawBody: call.body,
      secret: SECRET,
      now: Math.floor(now() / 1000),
      replayGuard: new WebhookReplayGuard(),
    })
    expect(verdict).toEqual({ ok: true })
  })

  it('carries the event name, the instant and the data as structured JSON', async () => {
    const { calls, fetchImpl } = recorder()
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl,
      now: () => Date.parse('2026-08-16T10:00:00.000Z'),
    })

    await sender.send('content.publish', { collection: 'page', id: 'abc', path: '/about' })

    const body = JSON.parse(calls[0]?.body ?? '{}') as WebhookEventEnvelope
    expect(body).toEqual({
      event: 'content.publish',
      occurredAt: '2026-08-16T10:00:00.000Z',
      data: { collection: 'page', id: 'abc', path: '/about' },
    })
    expect(calls[0]?.headers['content-type']).toBe('application/json')
  })

  it('rejects a request signed with a different secret', async () => {
    const { calls, fetchImpl } = recorder()
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl,
    })

    await sender.send('content.publish', { id: 'abc' })
    const call = calls[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    const verdict = verifyIncomingWebhook({
      headers: {
        timestamp: call.headers['X-Cogenta-Timestamp'] ?? '',
        signature: call.headers['X-Cogenta-Signature'] ?? '',
      },
      rawBody: call.body,
      secret: 'a-different-secret',
    })
    expect(verdict).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a request whose body was altered in flight', async () => {
    const { calls, fetchImpl } = recorder()
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl,
    })

    await sender.send('content.publish', { id: 'abc' })
    const call = calls[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    const verdict = verifyIncomingWebhook({
      headers: {
        timestamp: call.headers['X-Cogenta-Timestamp'] ?? '',
        signature: call.headers['X-Cogenta-Signature'] ?? '',
      },
      rawBody: call.body.replace('"abc"', '"tampered"'),
      secret: SECRET,
    })
    expect(verdict).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('reaches every configured endpoint', async () => {
    const { calls, fetchImpl } = recorder()
    const sender = createWebhookEventSender({
      endpoints: ['https://one.example/hook', 'https://two.example/hook'],
      secret: SECRET,
      fetchImpl,
    })

    const results = await sender.send('content.unpublish', { id: 'abc' })

    expect(calls.map((call) => call.url)).toEqual([
      'https://one.example/hook',
      'https://two.example/hook',
    ])
    expect(results.every((result) => result.delivered)).toBe(true)
  })

  it('reports a refusing endpoint instead of throwing', async () => {
    const { fetchImpl } = recorder(503)
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl,
    })

    const [result] = await sender.send('content.publish', { id: 'abc' })

    expect(result?.delivered).toBe(false)
    expect(result?.status).toBe(503)
    expect(result?.error?.code).toBe('CHANNEL_WEBHOOK_DELIVERY_FAILED')
  })

  it('reports an unreachable endpoint instead of throwing', async () => {
    const sender = createWebhookEventSender({
      endpoints: ['https://receiver.example/hook'],
      secret: SECRET,
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
    })

    const [result] = await sender.send('content.publish', { id: 'abc' })

    expect(result?.delivered).toBe(false)
    expect(result?.status).toBeNull()
    expect(result?.error?.code).toBe('CHANNEL_WEBHOOK_DELIVERY_FAILED')
  })

  it('sends nothing at all when no endpoint is configured', async () => {
    const { calls, fetchImpl } = recorder()
    const sender = createWebhookEventSender({ endpoints: [], secret: SECRET, fetchImpl })

    expect(await sender.send('content.publish', { id: 'abc' })).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
