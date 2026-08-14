import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../src/manifest.js'
import type { PluginGrant } from '../../src/permissions/grants.js'
import {
  detectCapabilitiesNeedingApproval,
  resolveGrantedCapabilities,
} from '../../src/permissions/resolve.js'

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: '@auteur/mon-plugin',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: ['content.read', 'http.fetch:api.exemple.com'],
    provides: {},
    runtime: 'server',
    isolated: true,
    ...overrides,
  }
}

function grant(capability: string, pluginName = '@auteur/mon-plugin'): PluginGrant {
  return { pluginName, capability, grantedAt: '2026-01-01T00:00:00.000Z' }
}

describe('resolveGrantedCapabilities', () => {
  it('includes a capability that is both declared and granted', () => {
    const result = resolveGrantedCapabilities(manifest(), [grant('content.read')])
    expect(result).toEqual(['content.read'])
  })

  it('excludes a declared-but-never-granted capability', () => {
    const result = resolveGrantedCapabilities(manifest(), [])
    expect(result).toEqual([])
  })

  it('excludes a stale grant for a capability the current manifest no longer declares', () => {
    const result = resolveGrantedCapabilities(manifest({ capabilities: ['content.read'] }), [
      grant('content.read'),
      grant('deps.scan'), // no longer declared by this manifest version
    ])
    expect(result).toEqual(['content.read'])
  })

  it('never lets one parameterised capability cover a differently-parameterised one of the same bare name', () => {
    const result = resolveGrantedCapabilities(
      manifest({ capabilities: ['http.fetch:api.exemple.com'] }),
      [grant('http.fetch:evil.example.com')],
    )
    expect(result).toEqual([])
  })

  it('never leaks a grant belonging to a different plugin', () => {
    const result = resolveGrantedCapabilities(manifest(), [
      grant('content.read', '@auteur/autre-plugin'),
    ])
    expect(result).toEqual([])
  })
})

describe('detectCapabilitiesNeedingApproval', () => {
  it('returns nothing when the new manifest declares no capability beyond what was already granted', () => {
    const result = detectCapabilitiesNeedingApproval(manifest(), [
      'content.read',
      'http.fetch:api.exemple.com',
    ])
    expect(result).toEqual([])
  })

  it('flags a genuinely new capability an updated manifest declares for the first time', () => {
    const newManifest = manifest({
      capabilities: ['content.read', 'http.fetch:api.exemple.com', 'http.fetch:new.exemple.com'],
    })
    const result = detectCapabilitiesNeedingApproval(newManifest, [
      'content.read',
      'http.fetch:api.exemple.com',
    ])
    expect(result).toEqual(['http.fetch:new.exemple.com'])
  })

  it('proves an update is never auto-granted the new capability end to end', () => {
    // Old version: only content.read was ever approved.
    const oldGranted = ['content.read']
    // New version declares one more capability than before.
    const newManifest = manifest({
      capabilities: ['content.read', 'http.fetch:new.exemple.com'],
    })
    const needsApproval = detectCapabilitiesNeedingApproval(newManifest, oldGranted)
    expect(needsApproval).toEqual(['http.fetch:new.exemple.com'])

    // Resolving against the OLD grant rows (no fresh approval happened yet)
    // must never include the new capability — this is the actual
    // enforcement, not just the detection above.
    const resolved = resolveGrantedCapabilities(newManifest, [grant('content.read')])
    expect(resolved).toEqual(['content.read'])
    expect(resolved).not.toContain('http.fetch:new.exemple.com')
  })
})
