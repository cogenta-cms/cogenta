import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { type CollectionDefinition, createContentStore, createSchemaTables } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { runPluginCommand } from '../src/commands/plugin.js'
import { createOutput } from '../src/output.js'

/**
 * L31 step 1, end to end on a real site: a plugin sitting in `plugins/`, its
 * code read from disk, run inside the real isolated worker, reading real
 * content through a capability it was really granted.
 *
 * What only this layer proves is the part that did not exist before: a
 * plugin had nowhere to live, nothing read its code, and `runPlugin` had no
 * caller. A test that called `runPlugin` with a string would prove none of
 * it.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'note',
    labels: { singular: 'Note', plural: 'Notes' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: { read: ['public'] },
  },
]

const MANIFEST = `${JSON.stringify(
  {
    name: 'reader',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: ['content.read'],
    provides: {},
    runtime: 'server',
    isolated: true,
  },
  null,
  2,
)}\n`

/** A plugin that only works if the capability really reached the sandbox. */
const CODE = `({
  read: async (input) => {
    const entry = await sdk.content.read({ id: input.id })
    return { title: entry.values.title }
  },
})`

interface Project {
  readonly root: string
  readonly entryId: string
}

async function project(options: { readonly code?: string } = {}): Promise<Project> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-plugin-cli-'))
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
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export const collections = ${JSON.stringify(COLLECTIONS)}\nexport default collections\n`,
    'utf8',
  )

  const pluginDir = join(root, 'plugins', 'reader')
  await mkdir(pluginDir, { recursive: true })
  await writeFile(join(pluginDir, 'plugin.manifest.json'), MANIFEST, 'utf8')
  await writeFile(join(pluginDir, 'plugin.js'), options.code ?? CODE, 'utf8')

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, COLLECTIONS)
  const store = createContentStore({ db, collection: COLLECTIONS[0] as CollectionDefinition })
  const created = await store.create({ values: { title: 'A real note' } })
  // Published: a plugin reads a site's public face, never its drafts.
  await store.publish(created.id)
  await db.close()
  return { root, entryId: created.id }
}

function capture() {
  let text = ''
  const write = (chunk: string): void => {
    text += chunk
  }
  return { out: createOutput(write, false), stderr: write, read: () => text }
}

describe('cogenta plugin', () => {
  it('lists what a site has installed, with where its code is', async () => {
    const { root } = await project()
    const io = capture()

    const code = await runPluginCommand({
      subcommand: 'list',
      args: [],
      cwd: root,
      out: io.out,
      stderr: io.stderr,
    })

    expect(code).toBe(0)
    expect(io.read()).toContain('reader 1.0.0')
    expect(io.read()).toContain('plugin.js')
  })

  it('runs a plugin with nothing granted, and its capability is simply absent', async () => {
    const { root, entryId } = await project()
    const io = capture()

    const code = await runPluginCommand({
      subcommand: 'run',
      args: ['reader'],
      cwd: root,
      invoke: 'read',
      input: JSON.stringify({ id: entryId }),
      out: io.out,
      stderr: io.stderr,
    })

    expect(code).toBe(1)
    // Not "refused": an ungranted capability is not on the SDK at all.
    expect(io.read()).toMatch(/content|undefined/u)
  })

  it('reads real content once the capability is really granted', async () => {
    const { root, entryId } = await project()
    const granted = capture()

    expect(
      await runPluginCommand({
        subcommand: 'grant',
        args: ['reader', 'content.read'],
        cwd: root,
        out: granted.out,
        stderr: granted.stderr,
      }),
    ).toBe(0)

    const io = capture()
    const code = await runPluginCommand({
      subcommand: 'run',
      args: ['reader'],
      cwd: root,
      collection: 'note',
      invoke: 'read',
      input: JSON.stringify({ id: entryId }),
      out: io.out,
      stderr: io.stderr,
    })

    expect(code).toBe(0)
    expect(io.read()).toContain('A real note')
    expect(io.read()).toContain('1 granted capability')
  })

  it('refuses to grant a capability the plugin never asked for', async () => {
    const { root } = await project()
    const io = capture()

    const code = await runPluginCommand({
      subcommand: 'grant',
      args: ['reader', 'content.delete'],
      cwd: root,
      out: io.out,
      stderr: io.stderr,
    })

    expect(code).toBe(1)
    expect(io.read()).toContain('does not request')
  })

  it('reports a plugin that ships no code rather than pretending it ran', async () => {
    const { root } = await project()
    const io = capture()
    const { rm } = await import('node:fs/promises')
    await rm(join(root, 'plugins', 'reader', 'plugin.js'))

    const code = await runPluginCommand({
      subcommand: 'check',
      args: ['reader'],
      cwd: root,
      out: io.out,
      stderr: io.stderr,
    })

    expect(code).toBe(1)
    expect(io.read()).toContain('ships no code')
  })
})
