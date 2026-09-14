import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runDev } from '../src/commands/dev-supervisor.js'
import { createOutput } from '../src/output.js'

/**
 * L28 D7: `cogenta dev` loads its collections at start-up like `cogenta serve`,
 * and restarts itself when `cogenta.schema.*` changes — which is what lets the
 * admin write a schema (site plan, sample data) without asking the person to
 * go and restart a terminal. Proven against a real server on a real port: the
 * new collection must actually answer after the restart, on the same port.
 */

const PAGE = `{
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}`

const NOTE = `{
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}`

const dirs: string[] = []
const controllers: AbortController[] = []

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort()
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 10 })),
  )
})

async function project(schema: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-dev-supervisor-'))
  dirs.push(root)
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeSchema(root, schema)
  return root
}

let generation = 0
/** Writes the schema and moves its mtime forward, so a coarse filesystem clock cannot hide the change. */
async function writeSchema(root: string, body: string): Promise<void> {
  const path = join(root, 'cogenta.schema.mjs')
  await writeFile(path, body, 'utf8')
  generation += 1
  const when = new Date(Date.now() + generation * 2000)
  await utimes(path, when, when)
}

function startDev(root: string) {
  const controller = new AbortController()
  controllers.push(controller)
  const listens: Array<{ port: number; host: string }> = []
  const waiters: Array<() => void> = []
  const lines: string[] = []
  const done = runDev({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
    logger: createLogger({ level: 'silent' }),
    out: createOutput((text) => lines.push(text), false),
    stderr: (text) => lines.push(text),
    port: 0,
    schemaPollMs: 50,
    signal: controller.signal,
    onListening: (address) => {
      listens.push(address)
      for (const wake of waiters.splice(0)) wake()
    },
  })
  const listening = async (count: number): Promise<{ port: number; host: string }> => {
    const deadline = Date.now() + 60_000
    while (listens.length < count) {
      if (Date.now() > deadline)
        throw new Error(`server listened ${listens.length} time(s), not ${count}`)
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 100)
      })
    }
    return listens[count - 1] as { port: number; host: string }
  }
  return { controller, done, listening, lines }
}

describe('cogenta dev restarts itself when the schema changes (L28 D7)', () => {
  it('serves a collection added to the schema file, on the same port, without a manual restart', async () => {
    const root = await project(`export default [${PAGE}]\n`)
    const dev = startDev(root)

    const first = await dev.listening(1)
    const base = `http://${first.host}:${first.port}`
    expect((await fetch(`${base}/api/content/note`)).status).toBe(404)

    await writeSchema(root, `export default [${PAGE}, ${NOTE}]\n`)
    const second = await dev.listening(2)

    expect(second.port).toBe(first.port)
    expect((await fetch(`${base}/api/content/note`)).status).toBe(200)
    expect(dev.lines.join('')).toContain('restarting the development server')

    dev.controller.abort()
    expect(await dev.done).toBe(0)
  }, 120_000)

  it('waits for the next save when the new schema does not load, instead of exiting', async () => {
    const root = await project(`export default [${PAGE}]\n`)
    const dev = startDev(root)
    const first = await dev.listening(1)

    await writeSchema(root, 'export default [ this is not javascript\n')
    // The broken schema stops the server; nothing listens a second time.
    const deadline = Date.now() + 30_000
    while (!dev.lines.join('').includes('Waiting for cogenta.schema.*')) {
      if (Date.now() > deadline) throw new Error(`never waited: ${dev.lines.join('')}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    await writeSchema(root, `export default [${PAGE}, ${NOTE}]\n`)
    const second = await dev.listening(2)
    expect(second.port).toBe(first.port)
    expect((await fetch(`http://${second.host}:${second.port}/api/content/note`)).status).toBe(200)

    dev.controller.abort()
    await dev.done
  }, 120_000)

  it('stops for good when asked to, even while waiting for a save', async () => {
    const root = await project('export default [ broken\n')
    const dev = startDev(root)
    const deadline = Date.now() + 30_000
    while (!dev.lines.join('').includes('Waiting for cogenta.schema.*')) {
      if (Date.now() > deadline) throw new Error(`never waited: ${dev.lines.join('')}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    dev.controller.abort()
    expect(await dev.done).not.toBe(0)
  }, 60_000)
})
