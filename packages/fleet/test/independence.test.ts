import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Acceptance criterion (`docs/lots/L8-flotte.md` line 134): "Un site peut
 * être détaché de la flotte et continuer à fonctionner seul." This is not a
 * new mechanism task 8 builds — it is a structural property `@cogenta/fleet`
 * has had since task 1: no core CMS package ever depends on it, so a site's
 * real content-serving/rendering/authoring has zero runtime dependency on
 * fleet code existing, being reachable, or even being installed. This test
 * makes that a real, checked fact rather than an assumption.
 */
const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

const CORE_PACKAGES = [
  'core',
  'schema',
  'render',
  'api',
  'cli',
  'auth',
  'blocks',
  'theme-canonical',
] as const

describe('a site functions independently of the fleet control plane', () => {
  it.each(CORE_PACKAGES)('%s never declares a dependency on @cogenta/fleet', async (name) => {
    const raw = await readFile(join(repoRoot, 'packages', name, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> }
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@cogenta/fleet')
  })
})
