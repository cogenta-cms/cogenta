import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyIncomingWebhook } from '@cogenta/channels'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L14 task 4, end to end: real failed sign-ins over real HTTP, then the two
 * places the site is supposed to say so — the admin's notice list, and the
 * signed outbound channel.
 */

const WEBHOOK_SECRET = 'a-real-shared-webhook-secret'

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], publish: ['editor'] },
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
  close(): Promise<void>
}

async function startReceiver(): Promise<Receiver> {
  const received: Received[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        timestamp: String(req.headers['x-cogenta-timestamp'] ?? ''),
        signature: String(req.headers['x-cogenta-signature'] ?? ''),
        rawBody: Buffer.concat(chunks).toString('utf8'),
      })
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('receiver has no port')
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

async function project(endpoints: readonly string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-security-e2e-'))
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

const activeServers: AbortController[] = []
const openReceivers: Receiver[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const receiver of openReceivers.splice(0)) await receiver.close()
})

/** Real, refused sign-in requests — never a direct write to the attempts table. */
async function guessPassword(base: string, email: string, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: `wrong-guess-${i}` }),
    })
    // 401 for a bad password, 429 once the limiter starts refusing outright.
    expect([401, 429]).toContain(response.status)
  }
}

interface Notice {
  readonly id: string
  readonly severity: string
  readonly params?: Record<string, string>
}

async function notices(base: string, token: string): Promise<readonly Notice[]> {
  const response = await fetch(`${base}/api/notices`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: Notice[] }
  return body.data
}

describe('suspicious sign-in activity', () => {
  it('shows an admin a notice after a run of failed sign-ins', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])

    const before = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct-horse-battery-staple',
    )
    expect((await notices(server.base, before)).map((notice) => notice.id)).not.toContain(
      'security.suspicious-activity',
    )

    await guessPassword(server.base, 'victim@example.com', 9)

    const found = (await notices(server.base, before)).find(
      (notice) => notice.id === 'security.suspicious-activity',
    )
    expect(found).toBeDefined()
    expect(found?.severity).toBe('danger')
    expect(found?.params?.subjects).toBe('1')

    await server.stop()
  })

  it('never puts the targeted address in what the admin is sent', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct-horse-battery-staple',
    )

    await guessPassword(server.base, 'victim@example.com', 9)

    expect(JSON.stringify(await notices(server.base, token))).not.toContain('victim')

    await server.stop()
  })

  it('tells an editor nothing about it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct-horse-battery-staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct-horse-battery-staple',
    )

    await guessPassword(server.base, 'victim@example.com', 9)

    expect((await notices(server.base, token)).map((notice) => notice.id)).not.toContain(
      'security.suspicious-activity',
    )

    await server.stop()
  })

  it('sends one signed alert on the channel, not one per attempt', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    await guessPassword(server.base, 'victim@example.com', 12)

    // The cooldown is the point: a script making hundreds of attempts must not
    // turn into hundreds of outbound requests.
    expect(receiver.received).toHaveLength(1)
    const call = receiver.received[0]
    expect(call).toBeDefined()
    if (call === undefined) return

    expect(
      verifyIncomingWebhook({
        headers: { timestamp: call.timestamp, signature: call.signature },
        rawBody: call.rawBody,
        secret: WEBHOOK_SECRET,
      }),
    ).toEqual({ ok: true })

    const envelope = JSON.parse(call.rawBody) as {
      event: string
      data: Record<string, unknown>
    }
    expect(envelope.event).toBe('security.suspicious_activity')
    expect(envelope.data.subjects).toBe(1)
    expect(envelope.data.severity).toBe('critical')
    expect(envelope.data.adminUrl).toBe('https://example.com/admin')
    // Same rule as the notice: counts leave the site, addresses do not.
    expect(call.rawBody).not.toContain('victim')

    await server.stop()
  })

  it('stays quiet on the channel for a single mistyped password', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const root = await project([receiver.url])
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    })

    await guessPassword(server.base, 'victim@example.com', 2)

    expect(receiver.received).toHaveLength(0)

    await server.stop()
  })

  it('says nothing anywhere once a real sign-in clears the attempts', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])

    // Nine wrong guesses, then the real password: `clear` on success is what
    // makes a person who eventually remembers their password stop being an
    // incident.
    await guessPassword(server.base, 'admin@example.com', 4)
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct-horse-battery-staple',
    )

    expect((await notices(server.base, token)).map((notice) => notice.id)).not.toContain(
      'security.suspicious-activity',
    )

    await server.stop()
  })
})
