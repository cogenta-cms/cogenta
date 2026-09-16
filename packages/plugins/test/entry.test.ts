import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pluginCodeDigest, pluginEntryPath, readPluginCode } from '../src/entry.js'
import { loadInstalledPlugins } from '../src/installed.js'
import { loadPlugin } from '../src/loader.js'
import type { PluginManifest } from '../src/manifest.js'

/**
 * L31 step 1: a plugin's code lives in a file its manifest names, a site
 * holds its plugins in one directory, and neither a missing file nor a
 * broken manifest may take a site down with it.
 */

const MANIFEST: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: [],
  provides: {},
  runtime: 'server',
  isolated: true,
}

function manifestSource(extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      name: 'test-plugin',
      version: '1.0.0',
      engine: '^1.0.0',
      capabilities: [],
      provides: {},
      runtime: 'server',
      isolated: true,
      ...extra,
    },
    null,
    2,
  )}\n`
}

describe('a plugin’s code on disk', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-plugin-entry-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads the file the manifest names, defaulting to plugin.js', async () => {
    await writeFile(join(dir, 'plugin.js'), '({ handle: () => 1 })', 'utf8')

    expect(pluginEntryPath(dir, MANIFEST)).toBe(join(dir, 'plugin.js'))
    expect(await readPluginCode(dir, MANIFEST)).toBe('({ handle: () => 1 })')
    expect(
      await readPluginCode(dir, { ...MANIFEST, main: 'src/other.js' }).catch(
        (error: unknown) => (error as CogentaError).code,
      ),
    ).toBe('PLUGIN_SOURCE_NOT_FOUND')
  })

  it('refuses an entry file that leaves the package, whatever the manifest says', () => {
    expect(() => pluginEntryPath(dir, { ...MANIFEST, main: '../escape.js' })).toThrow(CogentaError)
    expect(() => pluginEntryPath(dir, { ...MANIFEST, main: '/etc/passwd' })).toThrow(CogentaError)
  })

  it('refuses code beyond the size limit before reading it into memory', async () => {
    await writeFile(join(dir, 'plugin.js'), 'x'.repeat(2048), 'utf8')

    const error = await readPluginCode(dir, MANIFEST, { maxBytes: 1024 }).catch((caught) => caught)

    expect(error).toBeInstanceOf(CogentaError)
    expect((error as CogentaError).code).toBe('PLUGIN_MANIFEST_INVALID')
  })

  it('reports the entry path a loaded plugin ships, and null when it ships none', async () => {
    await writeFile(join(dir, 'plugin.manifest.json'), manifestSource(), 'utf8')

    expect((await loadPlugin(dir)).entryPath).toBeNull()

    await writeFile(join(dir, 'plugin.js'), '({})', 'utf8')
    expect((await loadPlugin(dir)).entryPath).toBe(join(dir, 'plugin.js'))
  })

  it('digests code so that changing one character changes the signature payload', () => {
    expect(pluginCodeDigest('({ a: 1 })')).not.toBe(pluginCodeDigest('({ a: 2 })'))
    expect(pluginCodeDigest('({ a: 1 })')).toBe(pluginCodeDigest('({ a: 1 })'))
  })
})

describe('the plugins a site has installed', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cogenta-plugin-site-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('finds every plugin directory, and reports a broken one instead of throwing', async () => {
    const good = join(root, 'plugins', 'good')
    const broken = join(root, 'plugins', 'broken')
    await mkdir(good, { recursive: true })
    await mkdir(broken, { recursive: true })
    await writeFile(join(good, 'plugin.manifest.json'), manifestSource(), 'utf8')
    await writeFile(join(good, 'plugin.js'), '({})', 'utf8')
    await writeFile(join(broken, 'plugin.manifest.json'), '{ "name": 42 }\n', 'utf8')

    const installed = await loadInstalledPlugins({ projectRoot: root })

    expect(installed.plugins.map((plugin) => plugin.manifest.name)).toEqual(['test-plugin'])
    expect(installed.failures.map((failure) => failure.directory)).toEqual(['broken'])
    expect(installed.failures[0]?.code).toBe('PLUGIN_MANIFEST_INVALID')
  })

  it('is empty, not an error, for a site with no plugins directory at all', async () => {
    const installed = await loadInstalledPlugins({ projectRoot: root })

    expect(installed.plugins).toEqual([])
    expect(installed.failures).toEqual([])
  })
})
