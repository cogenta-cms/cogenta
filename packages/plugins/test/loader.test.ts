import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPlugin } from '../src/loader.js'

const VALID_MANIFEST = `export default {
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['content.read'],
  provides: {},
  runtime: 'server',
  isolated: true,
}
`

describe('loadPlugin', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-plugin-loader-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('resolves a valid local plugin and reports its source', async () => {
    await writeFile(join(dir, 'plugin.manifest.mjs'), VALID_MANIFEST, 'utf8')

    const resolved = await loadPlugin(dir)

    expect(resolved.source).toBe('local')
    expect(resolved.packageRoot).toBe(dir)
    expect(resolved.manifestPath).toBe(join(dir, 'plugin.manifest.mjs'))
    expect(resolved.manifest.name).toBe('test-plugin')
  })

  it('a local plugin is dev mode — allowed unsigned, no signature checked (L7 task 9)', async () => {
    await writeFile(join(dir, 'plugin.manifest.mjs'), VALID_MANIFEST, 'utf8')

    const resolved = await loadPlugin(dir)

    expect(resolved.devMode).toBe(true)
    expect(resolved.signatureVerified).toBe(false)
  })

  it('checks manifest file names in the documented order', async () => {
    // .mjs is last in PLUGIN_MANIFEST_FILE_NAMES — .ts would win if present,
    // so writing only .mjs proves the fallback search, not just the first hit.
    await writeFile(join(dir, 'plugin.manifest.mjs'), VALID_MANIFEST, 'utf8')
    const resolved = await loadPlugin(dir)
    expect(resolved.manifestPath.endsWith('plugin.manifest.mjs')).toBe(true)
  })

  it('rejects a local path with no manifest file', async () => {
    await expect(loadPlugin(dir)).rejects.toMatchObject({
      code: 'PLUGIN_MANIFEST_FILE_NOT_FOUND',
    })
  })

  it('rejects a local path that does not exist', async () => {
    await expect(loadPlugin(join(dir, 'does-not-exist'))).rejects.toMatchObject({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
    })
  })

  it('rejects a manifest file with no default export', async () => {
    await writeFile(join(dir, 'plugin.manifest.mjs'), 'export const notDefault = 1\n', 'utf8')
    await expect(loadPlugin(dir)).rejects.toMatchObject({
      code: 'PLUGIN_MANIFEST_EXPORT_INVALID',
    })
  })

  it('rejects a manifest whose default export fails validation, wrapping the real issue', async () => {
    await writeFile(
      join(dir, 'plugin.manifest.mjs'),
      `export default {
        name: 'test-plugin',
        version: '1.0.0',
        engine: '^1.0.0',
        capabilities: ['http.fetch:*'],
        provides: {},
        runtime: 'server',
        isolated: true,
      }
      `,
      'utf8',
    )
    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_INVALID' })
  })

  it('rejects a manifest file with a real syntax error', async () => {
    await writeFile(join(dir, 'plugin.manifest.mjs'), 'this is not valid javascript {{{', 'utf8')
    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_LOAD_FAILED' })
  })

  it('recognises a git reference and refuses honestly instead of pretending to resolve it', async () => {
    await expect(loadPlugin('git+https://example.com/plugin.git')).rejects.toMatchObject({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
    })
    await expect(loadPlugin('github:example/plugin')).rejects.toMatchObject({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
    })
  })

  it('rejects an unresolvable registry package name', async () => {
    await expect(loadPlugin('this-package-does-not-exist-anywhere-xyz')).rejects.toMatchObject({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
    })
  })

  it('reports engine compatibility using the real semver matcher', async () => {
    await writeFile(join(dir, 'plugin.manifest.mjs'), VALID_MANIFEST, 'utf8')

    const compatible = await loadPlugin(dir, { engineVersion: '1.2.3' })
    expect(compatible.engineCompatible).toBe(true)

    const incompatible = await loadPlugin(dir, { engineVersion: '2.0.0' })
    expect(incompatible.engineCompatible).toBe(false)
  })

  it('every thrown error is a real CogentaError, never a bare Error', async () => {
    try {
      await loadPlugin(join(dir, 'does-not-exist'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
    }
  })
})
