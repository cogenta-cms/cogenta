import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CogentaError } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSandbox,
  listSandboxFiles,
  readSandboxFile,
  renderSandboxPreview,
  writeSandboxFile,
} from '../src/commands/theme-sandbox.js'

/**
 * Reading a sandbox back — the half that was missing for a theme to be
 * *adjusted* rather than only created. Without it, a second request ("make
 * it darker") reaches an agent that has never seen the theme it is being
 * asked to change, and whose only options are to guess or to rewrite
 * everything the operator just approved.
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')

describe('reading what is already in a theme sandbox', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function projectRoot(): Promise<string> {
    await mkdir(TMP_ROOT, { recursive: true })
    const root = await mkdtemp(join(TMP_ROOT, 'sandbox-read-'))
    roots.push(root)
    return root
  }

  it('lists every theme file, sorted, including ones in subdirectories', async () => {
    const root = await projectRoot()
    const dir = await createSandbox(root, 'listing')
    await writeFile(join(dir, 'theme.render.mjs'), 'export const x = 1', 'utf8')
    await writeFile(join(dir, 'style.css'), '.a{color:#111}', 'utf8')
    await mkdir(join(dir, 'partials'), { recursive: true })
    await writeFile(join(dir, 'partials', 'header.css'), '.h{}', 'utf8')

    expect(await listSandboxFiles(root, 'listing')).toEqual([
      'partials/header.css',
      'style.css',
      'theme.render.mjs',
    ])
  })

  it('hides the preview adapter, which is regenerated and is not part of the theme', async () => {
    const root = await projectRoot()
    const dir = await createSandbox(root, 'adapter')
    await writeFile(
      join(dir, 'theme.render.mjs'),
      "import { h } from '@cogenta/theme-kit'\nexport function renderPage(p){return h('main',{},p.title)}\nexport function renderChrome(){return {header:'',footer:''}}",
      'utf8',
    )

    // A real preview writes the adapter into the sandbox as a side effect.
    await renderSandboxPreview({ projectRoot: root, id: 'adapter' })

    const files = await listSandboxFiles(root, 'adapter')
    expect(files).toContain('theme.render.mjs')
    expect(files.some((file) => file.startsWith('.cogenta-preview-adapter'))).toBe(false)
  })

  it('answers "nothing here" for a sandbox that does not exist, rather than throwing', async () => {
    const root = await projectRoot()
    expect(await listSandboxFiles(root, 'never-created')).toEqual([])
  })

  it('returns a file exactly as written', async () => {
    const root = await projectRoot()
    const dir = await createSandbox(root, 'reading')
    await writeFile(join(dir, 'style.css'), '.hero{background:#0e1013}\n', 'utf8')

    expect(await readSandboxFile(root, 'reading', 'style.css')).toBe('.hero{background:#0e1013}\n')
  })

  it('names a missing file instead of returning empty content that would be edited blind', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'missing')

    await expect(readSandboxFile(root, 'missing', 'nope.css')).rejects.toThrow(CogentaError)
    await expect(readSandboxFile(root, 'missing', 'nope.css')).rejects.toMatchObject({
      code: 'THEME_SANDBOX_FILE_NOT_FOUND',
    })
  })

  it('refuses to read its way out of the sandbox', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'escape')
    await writeFile(join(root, 'secret.txt'), 'not yours', 'utf8')

    await expect(readSandboxFile(root, 'escape', '../secret.txt')).rejects.toMatchObject({
      code: 'THEME_SANDBOX_PATH_ESCAPE',
    })
  })
})

/**
 * A theme's job is to display the site's content, never to contain it. A
 * hardcoded `href="#"` is the visible edge of getting that wrong: it ships a
 * dead link to a real visitor, and it means the markup around it was written
 * as a mockup rather than as a container for real entries.
 *
 * Reported, not refused — `#main` as a fragment target is legitimate, so a
 * rejection would block real work to prevent a likely mistake. The warning
 * goes back in the write receipt, where the agent that wrote the file reads
 * it before its next call.
 */
describe('warning about a theme that contains content instead of displaying it', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function sandbox(id: string): Promise<string> {
    await mkdir(TMP_ROOT, { recursive: true })
    const root = await mkdtemp(join(TMP_ROOT, 'smell-'))
    roots.push(root)
    await createSandbox(root, id)
    return root
  }

  it('flags a dead link written into a theme module', async () => {
    const root = await sandbox('smelly')
    const result = await writeSandboxFile(
      root,
      'smelly',
      'cards.mjs',
      `export const card = (t) => '<a href="#">' + t + '</a>'`,
    )

    expect(result.path).toBe('cards.mjs')
    expect(result.warnings?.[0]).toContain('href="#"')
  })

  it('says nothing about a module that links through the content it was given', async () => {
    const root = await sandbox('clean')
    const result = await writeSandboxFile(
      root,
      'clean',
      'cards.mjs',
      `export const card = (entry, ctx) => '<a href="' + ctx.link(entry) + '">' + entry.title + '</a>'`,
    )

    expect(result.warnings).toBeUndefined()
  })

  it('never warns about a stylesheet, where a fragment selector is ordinary', async () => {
    const root = await sandbox('css')
    const result = await writeSandboxFile(root, 'css', 'style.css', `a[href="#"] { color: red }`)

    expect(result.warnings).toBeUndefined()
  })
})
