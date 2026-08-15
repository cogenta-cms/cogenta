import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlugin } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('the plugin-starter manifest', () => {
  it('loads and validates for real through loadPlugin, from a local path', async () => {
    const resolved = await loadPlugin(packageRoot)

    expect(resolved.manifest.name).toBe('@example/plugin-starter')
    expect(resolved.source).toBe('local')
    // Local sources run in "mode développement" — no registry signature to
    // check, and `docs/lots/L7-extensibilite.md` says exactly that: allowed,
    // with a permanent warning a real admin surface would render.
    expect(resolved.devMode).toBe(true)
    expect(resolved.signatureVerified).toBe(false)
    expect(resolved.manifest.capabilities).toEqual([
      'content.read',
      'storage.read:plugins/plugin-starter',
      'storage.write:plugins/plugin-starter',
    ])
  })

  it('resolves manifestPath to the real plugin.manifest.mjs on disk', async () => {
    const resolved = await loadPlugin(packageRoot)
    expect(resolved.manifestPath).toBe(join(packageRoot, 'plugin.manifest.mjs'))
  })
})
