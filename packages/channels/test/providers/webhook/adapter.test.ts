import { describe, expect, it, vi } from 'vitest'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { createWebhookAdapter, type WebhookFetch } from '../../../src/providers/webhook/adapter.js'
import { verifyIncomingWebhook } from '../../../src/providers/webhook/signing.js'

const SECRET = 'shared-webhook-secret'

describe('createWebhookAdapter', () => {
  it('declares honest, buttonless, outbound-only capabilities', () => {
    const adapter = createWebhookAdapter({ secret: SECRET })

    expect(adapter.name).toBe('webhook')
    expect(adapter.capabilities).toEqual({
      richText: false,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    })
    expect(adapter.onInbound).toBeUndefined()
  })

  it('refuses identity verification with a clear, typed error', async () => {
    const adapter = createWebhookAdapter({ secret: SECRET })

    await expect(adapter.verifyIdentity({})).rejects.toMatchObject({
      code: 'CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED',
    })
  })

  it('sends a real, signed POST request that the real verifier accepts', async () => {
    let capturedUrl: string | undefined
    let capturedInit: Parameters<WebhookFetch>[1] | undefined
    const fetchImpl: WebhookFetch = vi.fn(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return { ok: true, status: 200 }
    })

    const adapter = createWebhookAdapter({ secret: SECRET, fetchImpl })
    const message = buildNotification('Le build est vert.')

    await adapter.send({ id: 'https://receiver.example.com/hooks/cogenta' }, message)

    expect(capturedUrl).toBe('https://receiver.example.com/hooks/cogenta')
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.headers['content-type']).toBe('application/json')

    const timestamp = capturedInit?.headers['X-Cogenta-Timestamp']
    const signature = capturedInit?.headers['X-Cogenta-Signature']
    expect(timestamp).toBeDefined()
    expect(signature).toBeDefined()

    const rawBody = capturedInit?.body ?? ''
    expect(JSON.parse(rawBody)).toMatchObject({ level: 'notification', text: 'Le build est vert.' })

    // The genuinely independent side of the primitive: a receiver's real
    // verification function accepts what this adapter actually sent.
    const result = verifyIncomingWebhook({
      headers: { timestamp: timestamp ?? '', signature: signature ?? '' },
      rawBody,
      secret: SECRET,
    })
    expect(result).toEqual({ ok: true })
  })

  it('renders approve/deny actions as signed links, not buttons, in the outbound payload', async () => {
    let capturedBody = ''
    const fetchImpl: WebhookFetch = vi.fn(async (_url, init) => {
      capturedBody = init.body
      return { ok: true, status: 204 }
    })

    const adapter = createWebhookAdapter({
      secret: SECRET,
      fetchImpl,
      actionLinks: {
        baseUrl: 'https://example.com/approve',
        signingKey: 'link-secret',
        expiresInSeconds: 1200,
      },
    })
    const message = buildAlert({
      title: 'Approbation requise',
      severity: 'warning',
      context: 'ctx',
      expectedAction: 'Approuver ou refuser.',
      adminUrl: 'https://admin.example.com/approvals/1',
      actions: [{ id: 'approve TOKEN123', label: 'Approuver' }],
    })

    await adapter.send({ id: 'https://receiver.example.com/hooks' }, message)

    const payload = JSON.parse(capturedBody)
    expect(payload.actions).toHaveLength(1)
    expect(payload.actions[0].label).toBe('Approuver')
    expect(payload.actions[0].url).toContain('token=TOKEN123')
  })

  it('throws a typed error when delivery fails with a non-2xx status', async () => {
    const fetchImpl: WebhookFetch = vi.fn(async () => ({ ok: false, status: 500 }))
    const adapter = createWebhookAdapter({ secret: SECRET, fetchImpl })

    await expect(
      adapter.send({ id: 'https://receiver.example.com/hooks' }, buildNotification('x')),
    ).rejects.toMatchObject({ code: 'CHANNEL_WEBHOOK_DELIVERY_FAILED' })
  })

  it('never leaks channel-specific formatting into the outbound payload', async () => {
    let capturedBody = ''
    const fetchImpl: WebhookFetch = vi.fn(async (_url, init) => {
      capturedBody = init.body
      return { ok: true, status: 200 }
    })
    const adapter = createWebhookAdapter({ secret: SECRET, fetchImpl })

    await adapter.send(
      { id: 'https://receiver.example.com/hooks' },
      buildAlert({
        title: 'Alerte',
        severity: 'critical',
        context: 'ctx',
        expectedAction: 'agir',
        adminUrl: 'https://admin.example.com/x',
      }),
    )

    expect(capturedBody).not.toContain('parse_mode')
    expect(capturedBody).not.toContain('callback_data')
    expect(capturedBody).not.toContain('block_id')
  })
})
