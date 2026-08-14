import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { definePlugin, type PluginManifest } from '../src/manifest.js'

function validManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: '@auteur/mon-plugin',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: [
      'content.read',
      'http.fetch:api.exemple.com',
      'storage.write:plugins/mon-plugin',
    ],
    provides: { tools: ['exemple.analyser'], blocks: [], fields: [], channels: [] },
    runtime: 'server',
    isolated: true,
    ...overrides,
  }
}

describe('definePlugin', () => {
  it('accepts and freezes a fully valid manifest', () => {
    const manifest = definePlugin(validManifest())
    expect(manifest.name).toBe('@auteur/mon-plugin')
    expect(Object.isFrozen(manifest)).toBe(true)
  })

  it('refuses http.fetch with no domain', () => {
    expect(() => definePlugin(validManifest({ capabilities: ['http.fetch'] }))).toThrowError(
      /requires an explicit parameter/,
    )
  })

  it('refuses http.fetch with a wildcard domain', () => {
    expect(() => definePlugin(validManifest({ capabilities: ['http.fetch:*'] }))).toThrowError(
      /never "\*"/,
    )
  })

  it('refuses http.fetch with a malformed hostname', () => {
    expect(() =>
      definePlugin(validManifest({ capabilities: ['http.fetch:not a host'] })),
    ).toThrowError(/not a valid hostname/)
  })

  it("accepts a storage capability confined to the plugin's own prefix", () => {
    const manifest = definePlugin(
      validManifest({ capabilities: ['storage.write:plugins/mon-plugin/cache'] }),
    )
    expect(manifest.capabilities).toContain('storage.write:plugins/mon-plugin/cache')
  })

  it("refuses a storage capability outside the plugin's own prefix", () => {
    expect(() =>
      definePlugin(validManifest({ capabilities: ['storage.write:plugins/other-plugin'] })),
    ).toThrowError(/must stay within this plugin's own prefix/)
  })

  it('derives the storage prefix from the unscoped part of a scoped package name', () => {
    const manifest = definePlugin(
      validManifest({
        name: '@auteur/mon-plugin',
        capabilities: ['storage.write:plugins/mon-plugin'],
      }),
    )
    expect(manifest.name).toBe('@auteur/mon-plugin')
  })

  it('refuses an unknown capability name', () => {
    expect(() => definePlugin(validManifest({ capabilities: ['totally.unknown'] }))).toThrowError(
      /unknown capability "totally.unknown"/,
    )
  })

  it('refuses a bare capability carrying an unexpected parameter', () => {
    expect(() =>
      definePlugin(validManifest({ capabilities: ['content.read:something'] })),
    ).toThrowError(/does not take a parameter/)
  })

  it('refuses a block provision with no fallback', () => {
    expect(() =>
      definePlugin(
        validManifest({
          provides: { blocks: [{ name: 'customHero', fallback: '' }] },
        }),
      ),
    ).toThrowError(/a block without a fallback is refused/)
  })

  it('accepts a block provision with a real fallback', () => {
    const manifest = definePlugin(
      validManifest({
        provides: { blocks: [{ name: 'customHero', fallback: 'hero' }] },
      }),
    )
    expect(manifest.provides.blocks).toEqual([{ name: 'customHero', fallback: 'hero' }])
  })

  it('refuses an invalid version', () => {
    expect(() => definePlugin(validManifest({ version: 'not-semver' }))).toThrowError(
      /exact semver version/,
    )
  })

  it('refuses an invalid engine range', () => {
    expect(() => definePlugin(validManifest({ engine: 'whatever' }))).toThrowError(/semver range/)
  })

  it('refuses an invalid package name', () => {
    expect(() => definePlugin(validManifest({ name: 'Not A Valid Name!' }))).toThrowError(
      /valid package name/,
    )
  })

  it('reports every issue at once rather than one at a time', () => {
    try {
      definePlugin(
        validManifest({
          version: 'bad',
          engine: 'bad',
          capabilities: ['totally.unknown'],
        }),
      )
      expect.unreachable('definePlugin should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      const cogentaError = error as CogentaError
      expect(cogentaError.code).toBe('PLUGIN_MANIFEST_INVALID')
      const issues = cogentaError.details?.issues as readonly unknown[]
      expect(issues.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('accepts a manifest that provides nothing new', () => {
    const manifest = definePlugin(validManifest({ capabilities: [], provides: {} }))
    expect(manifest.provides).toEqual({})
  })
})
