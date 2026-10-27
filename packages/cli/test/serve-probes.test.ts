import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createProbeHandler } from '../src/commands/probes.js'
import { startServer } from './helpers/serve-harness.js'

async function project(security = ''): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-probes-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Probe site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
${security}}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

const activeServers: AbortController[] = []
const openServers: Server[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const server of openServers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('cogenta serve — /livez and /readyz', () => {
  it('answers /livez and /readyz anonymously with a bare word and no caching', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      for (const path of ['/livez', '/readyz']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.status, path).toBe(200)
        expect(await response.text(), path).toBe('ok')
        expect(response.headers.get('cache-control'), path).toBe('no-store')
        expect(response.headers.get('content-type'), path).toContain('text/plain')
        // Out of the HTML path: no policy is negotiated for a bare word.
        expect(response.headers.get('content-security-policy'), path).toBeNull()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('answers a HEAD request without a body', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/readyz`, { method: 'HEAD' })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses a method that is not GET or HEAD', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/livez`, { method: 'POST' })
      expect(response.status).toBe(405)
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('leaves /api/health admin-only: the probes did not open it', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/health`)
      expect(response.status).toBeGreaterThanOrEqual(400)
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('is not rate limited and never logs a 404', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      for (let i = 0; i < 80; i++) {
        const response = await fetch(`${server.base}/livez`)
        expect(response.status).toBe(200)
        await response.arrayBuffer()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('createProbeHandler', () => {
  async function listen(handler: ReturnType<typeof createProbeHandler>): Promise<string> {
    const server = createServer((req, res) => {
      void handler(req, res).then((answered) => {
        if (!answered) res.writeHead(418).end()
      })
    })
    openServers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  const logger = createLogger({ level: 'silent' })

  it('answers 503 and no detail when the database query fails', async () => {
    const base = await listen(
      createProbeHandler({
        ping: async () => {
          throw new Error('connect ECONNREFUSED 10.1.2.3:5432 password=hunter2')
        },
        logger,
      }),
    )
    const live = await fetch(`${base}/livez`)
    expect(live.status).toBe(200)
    await live.arrayBuffer()

    const ready = await fetch(`${base}/readyz`)
    expect(ready.status).toBe(503)
    const body = await ready.text()
    expect(body).toBe('unavailable')
    expect(body).not.toContain('hunter2')
    expect(ready.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 503 when the database does not answer in time', async () => {
    const base = await listen(
      createProbeHandler({ ping: () => new Promise(() => undefined), logger, timeoutMs: 50 }),
    )
    const started = Date.now()
    const ready = await fetch(`${base}/readyz`)
    expect(ready.status).toBe(503)
    await ready.arrayBuffer()
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('does not touch the database for /livez', async () => {
    let pings = 0
    const base = await listen(
      createProbeHandler({
        ping: async () => {
          pings++
        },
        logger,
      }),
    )
    const live = await fetch(`${base}/livez`)
    expect(live.status).toBe(200)
    await live.arrayBuffer()
    expect(pings).toBe(0)
  })

  it('reports not ready once the server is shutting down, so traffic drains first', async () => {
    const controller = new AbortController()
    const base = await listen(
      createProbeHandler({ ping: async () => undefined, logger, signal: controller.signal }),
    )
    const before = await fetch(`${base}/readyz`)
    expect(before.status).toBe(200)
    await before.arrayBuffer()

    controller.abort()
    const after = await fetch(`${base}/readyz`)
    expect(after.status).toBe(503)
    await after.arrayBuffer()
  })

  it('shares one database check between concurrent /readyz probes', async () => {
    let pings = 0
    let release: () => void = () => undefined
    const base = await listen(
      createProbeHandler({
        ping: () => {
          pings++
          return new Promise<void>((resolve) => {
            release = resolve
          })
        },
        logger,
      }),
    )
    const answers = Promise.all(Array.from({ length: 10 }, () => fetch(`${base}/readyz`)))
    while (pings === 0) await new Promise((resolve) => setTimeout(resolve, 5))
    await new Promise((resolve) => setTimeout(resolve, 50))
    release()
    for (const response of await answers) {
      expect(response.status).toBe(200)
      await response.arrayBuffer()
    }
    expect(pings).toBe(1)
  })

  it('reuses a fresh /readyz answer for a second, then asks the database again', async () => {
    let pings = 0
    let clock = 1_000_000
    const base = await listen(
      createProbeHandler({
        ping: async () => {
          pings++
        },
        logger,
        now: () => clock,
      }),
    )
    const probe = async (): Promise<number> => {
      const response = await fetch(`${base}/readyz`)
      await response.arrayBuffer()
      return response.status
    }
    expect(await probe()).toBe(200)
    clock += 999
    expect(await probe()).toBe(200)
    expect(pings).toBe(1)

    clock += 1
    expect(await probe()).toBe(200)
    expect(pings).toBe(2)
  })

  it('logs a failing database once, on the change of state, and again when it recovers', async () => {
    const lines: string[] = []
    const recording = createLogger({
      level: 'info',
      destination: (line) => lines.push(line),
    })
    let failing = true
    let clock = 1_000_000
    const base = await listen(
      createProbeHandler({
        ping: async () => {
          if (failing) throw new Error('down')
        },
        logger: recording,
        now: () => clock,
      }),
    )
    const probe = async (): Promise<number> => {
      clock += 2000
      const response = await fetch(`${base}/readyz`)
      await response.arrayBuffer()
      return response.status
    }
    expect(await probe()).toBe(503)
    expect(await probe()).toBe(503)
    expect(await probe()).toBe(503)
    expect(lines.filter((line) => line.includes('readiness probe failed'))).toHaveLength(1)

    failing = false
    expect(await probe()).toBe(200)
    expect(await probe()).toBe(200)
    expect(lines.filter((line) => line.includes('readiness probe recovered'))).toHaveLength(1)
    expect(lines).toHaveLength(2)
  })

  it('ignores any other path', async () => {
    const base = await listen(createProbeHandler({ ping: async () => undefined, logger }))
    const other = await fetch(`${base}/anything`)
    expect(other.status).toBe(418)
    await other.arrayBuffer()
  })
})
