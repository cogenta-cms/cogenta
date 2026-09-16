import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPlugin } from '../src/loader.js'

const VALID_MANIFEST = `${JSON.stringify(
  {
    name: 'test-plugin',
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

describe('loadPlugin', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-plugin-loader-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('resolves a valid local plugin and reports its source', async () => {
    await writeFile(join(dir, 'plugin.manifest.json'), VALID_MANIFEST, 'utf8')

    const resolved = await loadPlugin(dir)

    expect(resolved.source).toBe('local')
    expect(resolved.packageRoot).toBe(dir)
    expect(resolved.manifestPath).toBe(join(dir, 'plugin.manifest.json'))
    expect(resolved.manifest.name).toBe('test-plugin')
  })

  it('a local plugin is dev mode — allowed unsigned, no signature checked (L7 task 9)', async () => {
    await writeFile(join(dir, 'plugin.manifest.json'), VALID_MANIFEST, 'utf8')

    const resolved = await loadPlugin(dir)

    expect(resolved.devMode).toBe(true)
    expect(resolved.signatureVerified).toBe(false)
  })

  it('refuses an executable manifest, and says why (L31 step 5)', async () => {
    // A manifest used to be an imported module, which meant a plugin ran code
    // in the host process before anything checked it. Finding one now is a
    // named refusal rather than a silent "no manifest here".
    await writeFile(join(dir, 'plugin.manifest.mjs'), `export default ${VALID_MANIFEST}`, 'utf8')
    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_INVALID' })
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

  it('rejects a manifest that is not an object', async () => {
    await writeFile(join(dir, 'plugin.manifest.json'), '["not", "a manifest"]\n', 'utf8')
    await expect(loadPlugin(dir)).rejects.toMatchObject({
      code: 'PLUGIN_MANIFEST_EXPORT_INVALID',
    })
  })

  it('rejects a manifest whose content fails validation, wrapping the real issue', async () => {
    await writeFile(
      join(dir, 'plugin.manifest.json'),
      `${JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        engine: '^1.0.0',
        capabilities: ['http.fetch:*'],
        provides: {},
        runtime: 'server',
        isolated: true,
      })}\n`,
      'utf8',
    )
    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_INVALID' })
  })

  it('rejects a manifest that is not valid JSON', async () => {
    await writeFile(join(dir, 'plugin.manifest.json'), '{ not json ', 'utf8')
    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_INVALID' })
  })

  it('never executes a manifest, whatever it contains (L31 step 5)', async () => {
    // The proof is the absence of an effect: this file would create a marker
    // on import, and JSON.parse simply refuses it.
    await writeFile(
      join(dir, 'plugin.manifest.json'),
      'process.env.COGENTA_PLUGIN_MANIFEST_RAN = "yes"\n',
      'utf8',
    )

    await expect(loadPlugin(dir)).rejects.toMatchObject({ code: 'PLUGIN_MANIFEST_INVALID' })
    expect(process.env['COGENTA_PLUGIN_MANIFEST_RAN']).toBeUndefined()
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
    await writeFile(join(dir, 'plugin.manifest.json'), VALID_MANIFEST, 'utf8')

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
