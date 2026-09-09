import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZipWriter, openZip } from '@cogenta/export'
import { afterEach, describe, expect, it } from 'vitest'
import { exportThemeZip, importThemeZip } from '../src/commands/theme-export.js'
import {
  createSandbox as createThemeSandbox,
  deployThemeFromSandbox,
} from '../src/commands/theme-sandbox.js'

/**
 * Fiche 73 task 8 — real filesystem and real ZIP round trips throughout,
 * nothing mocked: `@cogenta/export`'s `createZipWriter`/`openZip` (already
 * used by `cogenta backup`) are reused as-is, never reimplemented (R9).
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')

const FULL_VOCABULARY = [
  'hero',
  'prose',
  'mediaFigure',
  'featureGrid',
  'cta',
  'gallery',
  'quote',
  'faq',
  'stats',
  'logos',
  'collectionList',
  'embed',
  'testimonial',
  'pricingTable',
  'accordion',
  'statCounter',
  'logoStrip',
]

const MANIFEST = `
export default {
  name: 'exportable-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
  implements: ${JSON.stringify(FULL_VOCABULARY)},
  collections: '*',
  runtime: 'server',
  tokens: 'theme.tokens.json',
  description: 'A theme built for the export/import round trip suite.',
  author: 'A developer, not an agent',
}
`

// Real h()-based markup, not a plain data object — `importThemeZip` writes
// each extracted file through `writeSandboxFile`, which now validates a
// theme.render.* by actually rendering it (fiche 73 task 7's own live E2E
// test found the old placeholder shape here would have been rejected too).
const RENDER_MODULE = `
import { h } from '@cogenta/theme-kit'
export function renderPage(page) {
  return h('main', { class: 'cg-main' }, page.title)
}
export function renderChrome() {
  return { header: '<header>Exportable</header>', footer: '<footer>Exportable</footer>' }
}
`

async function makeProjectRoot(): Promise<string> {
  await mkdir(TMP_ROOT, { recursive: true })
  return mkdtemp(join(TMP_ROOT, 'export-project-'))
}

/** Collects every chunk `exportThemeZip` streams into one buffer, and writes it to a real file so `importThemeZip` (which reads a real path) can consume it — the same "streamed to a sink the caller picks" contract an HTTP route or a CLI command would use. */
async function exportToFile(
  projectRoot: string,
  themeName: string,
  zipPath: string,
): Promise<void> {
  const chunks: Buffer[] = []
  await exportThemeZip({ projectRoot, themeName, write: (chunk) => void chunks.push(chunk) })
  await writeFile(zipPath, Buffer.concat(chunks))
}

describe('theme export/import (fiche 73 task 8)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses to export a theme name with no matching folder in themes/', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    await expect(
      exportThemeZip({ projectRoot: root, themeName: 'never-deployed', write: () => undefined }),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_SOURCE_NOT_FOUND' })
  })

  it('exports every real file of an installed theme into a real, readable zip', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createThemeSandbox(root, 'sbx-1')
    await writeFile(join(dir, 'theme.config.mjs'), MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'sbx-1', 'exported-theme')

    const zipPath = join(root, 'export.zip')
    await exportToFile(root, 'exported-theme', zipPath)

    const reader = await openZip(zipPath)
    try {
      const names = reader.entries.map((entry) => entry.name).sort()
      expect(names).toEqual(['theme.config.mjs', 'theme.render.mjs'])
    } finally {
      await reader.close()
    }
  })

  it('imports a zip into a fresh sandbox, with the exact same file contents', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createThemeSandbox(root, 'sbx-2')
    await writeFile(join(dir, 'theme.config.mjs'), MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'sbx-2', 'to-import-theme')

    const zipPath = join(root, 'import.zip')
    await exportToFile(root, 'to-import-theme', zipPath)

    const result = await importThemeZip({ projectRoot: root, zipPath, sandboxId: 'imported' })
    expect(result.sandboxId).toBe('imported')

    const importedManifest = await readFile(
      join(root, '.cogenta', 'theme-sandbox', 'imported', 'theme.config.mjs'),
      'utf8',
    )
    expect(importedManifest).toBe(MANIFEST)
  })

  it('a full round trip — deploy, export, import, deploy again — never touches themes/ on import alone', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createThemeSandbox(root, 'sbx-3')
    await writeFile(join(dir, 'theme.config.mjs'), MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'sbx-3', 'roundtrip-theme')

    const zipPath = join(root, 'roundtrip.zip')
    await exportToFile(root, 'roundtrip-theme', zipPath)
    await importThemeZip({ projectRoot: root, zipPath, sandboxId: 'roundtrip-sandbox' })

    // Import alone never deploys — the fiche's own "jamais un raccourci qui
    // contourne la vérification": deploying a second, different-named theme
    // from the imported sandbox is a separate, explicit call.
    const secondDeploy = await deployThemeFromSandbox(
      root,
      'roundtrip-sandbox',
      'roundtrip-theme-2',
    )
    expect(secondDeploy.ok).toBe(true)
    if (secondDeploy.ok) {
      const manifest = await readFile(join(secondDeploy.themeDirectory, 'theme.config.mjs'), 'utf8')
      const renderModule = await readFile(
        join(secondDeploy.themeDirectory, 'theme.render.mjs'),
        'utf8',
      )
      expect(manifest).toBe(MANIFEST)
      expect(renderModule).toBe(RENDER_MODULE)
    }
  })

  // Piège n°3 (§ 6) — a zip-slip regression test, not just a code comment.
  // A malicious archive (built with the same real writer, so this is a
  // genuine zip, not a hand-typed fixture) names an entry that tries to
  // escape the target sandbox — importThemeZip must refuse it, exactly
  // like a hand-typed path to theme.write_sandbox_file already does (task
  // 7's guard, reused here rather than reimplemented).
  it('refuses a zip-slip entry — an archive entry named to escape the sandbox is never extracted', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const zipPath = join(root, 'malicious.zip')

    const chunks: Buffer[] = []
    const writer = createZipWriter({ write: (chunk) => void chunks.push(chunk) })
    await writer.addFile('theme.config.mjs', Buffer.from(MANIFEST, 'utf8'))
    await writer.addFile('../../escaped.mjs', Buffer.from('malicious', 'utf8'))
    await writer.finish()
    await writeFile(zipPath, Buffer.concat(chunks))

    await expect(
      importThemeZip({ projectRoot: root, zipPath, sandboxId: 'attacked' }),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })

    await expect(readFile(join(root, 'escaped.mjs'), 'utf8')).rejects.toThrow()
  })
})
