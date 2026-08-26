import type { OutgoingEmail, SentEmail } from '@cogenta/channels'
import { createMemoryRateLimiter } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { buildSubmissionAlert, notifyNewSubmission, sendAutoresponder } from '../src/notify.js'
import type { FormDefinition, FormSubmission } from '../src/types.js'

function fakeTransport(): {
  sent: OutgoingEmail[]
  send(email: OutgoingEmail): Promise<SentEmail>
} {
  const sent: OutgoingEmail[] = []
  return {
    sent,
    send: async (email) => {
      sent.push(email)
      return { messageId: `msg-${sent.length}` }
    },
  }
}

function definition(overrides: Partial<FormDefinition> = {}): FormDefinition {
  return {
    id: 'form-1',
    name: 'contact',
    label: 'Contact',
    fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
    active: true,
    confirmationMessage: 'Thanks',
    redirectTo: null,
    notifyEmails: ['owner@example.com'],
    autoresponder: { enabled: false },
    retainDays: 30,
    steps: [],
    notifyChannels: [],
    captcha: { enabled: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function submission(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    id: 'sub-1',
    formId: 'form-1',
    formName: 'contact',
    values: { email: 'visitor@example.com' },
    consents: [],
    status: 'new',
    ipHash: 'hash',
    referrer: null,
    userAgent: null,
    submittedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildSubmissionAlert', () => {
  it('names the form and includes the submitted values', () => {
    const message = buildSubmissionAlert(
      definition(),
      submission(),
      'https://admin.example.com/forms',
    )
    expect(message.level).toBe('alert')
    expect(message.title).toContain('Contact')
    expect(message.context).toContain('visitor@example.com')
    expect(message.adminUrl).toBe('https://admin.example.com/forms')
  })
})

describe('notifyNewSubmission', () => {
  it('sends through the existing email adapter, never a second transport', async () => {
    const transport = fakeTransport()
    const result = await notifyNewSubmission({
      transport,
      definition: definition(),
      submission: submission(),
      adminUrl: 'https://admin.example.com',
    })
    expect(result.sent).toEqual(['owner@example.com'])
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]?.to).toBe('owner@example.com')
  })

  it('sends nothing when no recipient is configured', async () => {
    const transport = fakeTransport()
    const result = await notifyNewSubmission({
      transport,
      definition: definition({ notifyEmails: [] }),
      submission: submission(),
      adminUrl: 'https://admin.example.com',
    })
    expect(result.sent).toEqual([])
    expect(transport.sent).toHaveLength(0)
  })
})

describe('sendAutoresponder — disabled by default, rate-limited when on', () => {
  it('sends nothing when the autoresponder is disabled (the default)', async () => {
    const transport = fakeTransport()
    await sendAutoresponder({
      transport,
      definition: definition({ autoresponder: { enabled: false } }),
      recipientEmail: 'visitor@example.com',
      rateLimit: createMemoryRateLimiter(),
    })
    expect(transport.sent).toHaveLength(0)
  })

  it('sends once when enabled', async () => {
    const transport = fakeTransport()
    await sendAutoresponder({
      transport,
      definition: definition({ autoresponder: { enabled: true, body: 'Thanks!' } }),
      recipientEmail: 'visitor@example.com',
      rateLimit: createMemoryRateLimiter(),
    })
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]?.to).toBe('visitor@example.com')
  })

  it('cannot be used as a spam relay: a second send to the same address in the window is refused', async () => {
    const transport = fakeTransport()
    const rateLimit = createMemoryRateLimiter()
    const def = definition({ autoresponder: { enabled: true } })

    await sendAutoresponder({
      transport,
      definition: def,
      recipientEmail: 'victim@example.com',
      rateLimit,
    })
    await expect(
      sendAutoresponder({
        transport,
        definition: def,
        recipientEmail: 'victim@example.com',
        rateLimit,
      }),
    ).rejects.toMatchObject({ code: 'FORM_AUTORESPONDER_RATE_LIMITED' })

    expect(transport.sent).toHaveLength(1)
  })

  it('does not cap a different recipient because of another address hitting its limit', async () => {
    const transport = fakeTransport()
    const rateLimit = createMemoryRateLimiter()
    const def = definition({ autoresponder: { enabled: true } })

    await sendAutoresponder({
      transport,
      definition: def,
      recipientEmail: 'a@example.com',
      rateLimit,
    })
    await sendAutoresponder({
      transport,
      definition: def,
      recipientEmail: 'b@example.com',
      rateLimit,
    })

    expect(transport.sent).toHaveLength(2)
  })
})
