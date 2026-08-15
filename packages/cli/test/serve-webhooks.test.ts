import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyIncomingWebhook, WebhookReplayGuard } from '@cogenta/channels'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L14 task 1, end to end, against the lot's own acceptance criterion:
 * "Publier un contenu déclenche réellement un webhook sortant signé,
 * vérifiable par un test qui reçoit l'appel HTTP, pas qui vérifie juste que la
 * fonction a été appelée."
 *
 * So: a real `node:http` server on a real port is the receiver, a real
 * `cogenta serve` on a real SQLite database is the sender, and the publish is
 * a real HTTP request from a real signed-in editor. Nothing is stubbed
 * anywhere between the two — the signature the receiver verifies is the one
 * that travelled over a socket.
 */

const WEBHOOK_SECRET = 'a-real-shared-webhook-secret'

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

interface Received {
  readonly timestamp: string
  readonly signature: string
  readonly rawBody: string
}

interface Receiver {
  readonly url: string
  readonly received: Received[]
  /** Resolves once at least `count` requests have arrived, or rejects on timeout. */
  waitFor(count: number): Promise<void>
  close(): Promise<void>
}

async function startReceiver(status = 200): Promise<Receiver> {
  const received: Received[] = []
  let notify: (() => void) | null = null

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        timestamp: String(req.headers['x-cogenta-timestamp'] ?? ''),
        signature: String(req.headers['x-cogenta-signature'] ?? ''),
        rawBody: Buffer.concat(chunks).toString('utf8'),
      })
      notify?.()
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('receiver has no port')

  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    received,
    waitFor: (count) =>
      new Promise<void>((resolve, reject) => {
        if (received.length >= count) {
          resolve()
          return
        }
        const timer = setTimeout(() => {
          notify = null
          reject(new Error(`only ${received.length} of ${count} webhooks arrived`))
        }, 5_000)
        notify = () => {
          if (received.length < count) return
          clearTimeout(timer)
          notify = null
          resolve()
        }
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

async function project(endpoints: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-webhook-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  webhooks: { endpoints: ${JSON.stringify(endpoints)} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

const openReceivers: Receiver[] = []
const activeServers: AbortController[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const receiver of openReceivers.splice(0)) await receiver.close()
})

interface Envelope {
  readonly event: string
  readonly occurredAt: string
  readonly data: Record<string, unknown>
}

function envelopeOf(received: Received): Envelope {
  return JSON.parse(received.rawBody) as Envelope
}

async function signedInEditor(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery-staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery-staple')
}

async function createDraft(base: string, token: string, title: string, slug: string) {
  const response = await fetch(`${base}/api/content/page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ values: { title, slug } }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { data: { id: string } }
  return body.data.id
}

describe('outbound webhooks on the content lifecycle', () => {
  it('delivers a signed content.publish that the receiver verifies', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'About us', 'about-us')

    const publish = await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })
    expect(publish.status).toBe(200)

    await receiver.waitFor(1)
    const call = receiver.received[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    // The receiver's own verification, over the bytes that arrived on the
    // socket — not over anything the sender kept a copy of.
    expect(
      verifyIncomingWebhook({
        headers: { timestamp: call.timestamp, signature: call.signature },
        rawBody: call.rawBody,
        secret: WEBHOOK_SECRET,
        replayGuard: new WebhookReplayGuard(),
      }),
    ).toEqual({ ok: true })

    const envelope = envelopeOf(call)
    expect(envelope.event).toBe('content.publish')
    expect(envelope.data).toMatchObject({
      collection: 'page',
      id,
      status: 'published',
      path: '/about-us',
      url: 'https://example.com/about-us',
    })

    await server.stop()
  })

  it('rejects the very same delivery when checked against the wrong secret', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'Contact', 'contact')
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })

    await receiver.waitFor(1)
    const call = receiver.received[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    expect(
      verifyIncomingWebhook({
        headers: { timestamp: call.timestamp, signature: call.signature },
        rawBody: call.rawBody,
        secret: 'not-the-configured-secret',
      }),
    ).toEqual({ ok: false, reason: 'invalid_signature' })

    await server.stop()
  })

  /**
   * Withdrawal, over HTTP, is deletion today: `ContentStore.unpublish` exists
   * and this decorator covers it, but no REST or GraphQL route reaches it (see
   * BLOCKERS.md — a real gap, and L13's to close, not this lot's). Deleting a
   * published page is the withdrawal a consumer really can trigger, so that is
   * what this asserts end to end.
   */
  it('delivers content.delete when a published page is removed', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    await createUser(root, 'admin@example.com', 'correct-horse-battery-staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct-horse-battery-staple',
    )
    const id = await createDraft(server.base, token, 'Temporary', 'temporary')
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })
    await receiver.waitFor(1)

    const removed = await fetch(`${server.base}/api/content/page/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(removed.status).toBe(204)

    await receiver.waitFor(2)
    expect(receiver.received.map((call) => envelopeOf(call).event)).toEqual([
      'content.publish',
      'content.delete',
    ])
    expect(envelopeOf(receiver.received[1] as Received).data['path']).toBe('/temporary')

    await server.stop()
  })

  it('sends nothing while an entry is only being drafted', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'Work in progress', 'wip')
    const patch = await fetch(`${server.base}/api/content/page/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Still working' } }),
    })
    expect(patch.status).toBe(200)

    // No waitFor: the assertion is that nothing arrives. A short settle is
    // enough — delivery is awaited inside the publish request itself, so a
    // webhook that was going to be sent would already have been.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(receiver.received).toHaveLength(0)

    await server.stop()
  })

  it('reaches every configured endpoint', async () => {
    const first = await startReceiver()
    const second = await startReceiver()
    openReceivers.push(first, second)
    const root = await project([first.url, second.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'Broadcast', 'broadcast')
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })

    await first.waitFor(1)
    await second.waitFor(1)
    expect(envelopeOf(first.received[0] as Received).data['id']).toBe(id)
    expect(envelopeOf(second.received[0] as Received).data['id']).toBe(id)

    await server.stop()
  })

  it('still publishes when the receiver refuses the delivery', async () => {
    const receiver = await startReceiver(500)
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'Resilient', 'resilient')

    const publish = await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })

    // The editor's publish succeeded even though the webhook did not — that is
    // the whole point of the never-throws contract on the sender.
    expect(publish.status).toBe(200)
    await receiver.waitFor(1)

    const read = await fetch(`${server.base}/api/content/page/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await read.json()) as { data: { status: string } }
    expect(body.data.status).toBe('published')

    await server.stop()
  })

  it('sends nothing at all when no signing secret is configured', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    // No COGENTA_WEBHOOK_SECRET: an unsigned webhook is never an acceptable
    // fallback, so the site must stay silent rather than downgrade.
    const server = await startServer(root, { registry: activeServers })

    const token = await signedInEditor(root, server.base)
    const id = await createDraft(server.base, token, 'Silent', 'silent')
    const publish = await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    })
    expect(publish.status).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(receiver.received).toHaveLength(0)

    await server.stop()
  })
})
