import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-cli-generate-'))
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
    `export default [
  {
    name: 'post',
    labels: { singular: 'Post', plural: 'Posts' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', unique: true, options: { from: 'title' } },
    },
    indexes: [['slug']],
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]
`,
    'utf8',
  )
  return root
}

let written: string[]
const write = (text: string): void => {
  written.push(text)
}
const output = (): string => written.join('')

describe('cogenta generate types', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    written = []
  })

  it('writes real TypeScript declarations for the schema, at the default path', async () => {
    written = []
    const root = await project()
    dirs.push(root)

    const code = await run({ argv: ['generate', 'types', '--cwd', root], stdout: write, env: {} })

    expect(code).toBe(0)
    expect(output()).toContain('.cogenta')
    const declarations = await readFile(join(root, '.cogenta', 'types', 'schema.d.ts'), 'utf8')
    expect(declarations).toContain('interface Post')
    expect(declarations).toContain('title')
  })

  it('honours --out for a custom output path', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    const outFile = join(root, 'custom-types.d.ts')

    const code = await run({
      argv: ['generate', 'types', '--cwd', root, '--out', outFile],
      stdout: write,
      env: {},
    })

    expect(code).toBe(0)
    const declarations = await readFile(outFile, 'utf8')
    expect(declarations).toContain('interface Post')
  })

  it('exits 2 for an unknown subcommand — only "types" exists', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    let errText = ''

    const code = await run({
      argv: ['generate', 'migrations', '--cwd', root],
      stdout: write,
      stderr: (text) => {
        errText += text
      },
      env: {},
    })

    expect(code).toBe(2)
    expect(errText).toContain('Unknown subcommand')
  })

  it('exits 2 when no subcommand is given', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    let errText = ''

    const code = await run({
      argv: ['generate', '--cwd', root],
      stdout: write,
      stderr: (text) => {
        errText += text
      },
      env: {},
    })

    expect(code).toBe(2)
    expect(errText).toContain('needs a subcommand')
  })
})
