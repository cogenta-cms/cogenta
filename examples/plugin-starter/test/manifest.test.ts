import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPluginStylesheet, loadPlugin } from '@cogenta/plugins'
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

  it('declares the block, the widget and the stylesheet this example documents', async () => {
    const resolved = await loadPlugin(packageRoot)
    const provides = resolved.manifest.provides

    expect(provides.blocks?.map((block) => block.name)).toEqual(['callout'])
    // The fallback and where its fields come from: what keeps a page readable
    // once this plugin is uninstalled.
    expect(provides.blocks?.[0]).toMatchObject({
      fallback: 'quote',
      fallbackFrom: { text: 'message' },
    })
    expect(provides.widgets?.map((widget) => widget.name)).toEqual(['keyFigure'])
    expect(provides.styles).toBe('styles.css')
  })

  it('ships a stylesheet the host really accepts', async () => {
    const css = await readFile(join(packageRoot, 'styles.css'), 'utf8')

    // The host's own function, not a copy of its rules: this example cannot
    // drift into showing CSS a real site would refuse to serve.
    expect(checkPluginStylesheet(css)).toEqual({ ok: true })
  })

  it('resolves manifestPath to the real plugin.manifest.json on disk', async () => {
    const resolved = await loadPlugin(packageRoot)
    expect(resolved.manifestPath).toBe(join(packageRoot, 'plugin.manifest.json'))
  })
})
