import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findPackageFile, readTarGz } from '../../src/update/tar.js'

/**
 * Fixtures are real `npm pack` output (not hand-built), generated once
 * during this task and committed — the same "real corpus, not the writer's
 * own idea of the format" discipline L19's document-extraction tests use.
 * `cogenta-fixture-test-1.2.3.tgz` carries `package.json`, `dist/index.js`
 * and a real `CHANGELOG.md` with two version sections, one mentioning
 * "contract A"; `no-changelog-1.0.0.tgz` has no `CHANGELOG.md` at all — the
 * exact shape every `@cogenta/core`/`@cogenta/cli` version published before
 * this task ships (verified with a real `npm pack` during this task: `files:
 * ["dist"]` alone never included it).
 */

const FIXTURES = fileURLToPath(new URL('../fixtures/update/', import.meta.url))

describe('readTarGz / findPackageFile', () => {
  it('reads every file entry out of a real npm tarball', async () => {
    const gz = await readFile(join(FIXTURES, 'cogenta-fixture-test-1.2.3.tgz'))
    const entries = readTarGz(gz)
    const names = entries.map((entry) => entry.name).sort()
    expect(names).toEqual(['package/CHANGELOG.md', 'package/dist/index.js', 'package/package.json'])
  })

  it('extracts CHANGELOG.md content byte-for-byte', async () => {
    const gz = await readFile(join(FIXTURES, 'cogenta-fixture-test-1.2.3.tgz'))
    const entries = readTarGz(gz)
    const changelog = findPackageFile(entries, 'CHANGELOG.md')
    expect(changelog).not.toBeNull()
    const text = changelog?.toString('utf8') ?? ''
    expect(text).toContain('## 1.2.3')
    expect(text).toContain('contract A')
    expect(text).toContain('## 1.2.2')
  })

  it('returns null for a file the tarball does not carry', async () => {
    const gz = await readFile(join(FIXTURES, 'no-changelog-1.0.0.tgz'))
    const entries = readTarGz(gz)
    expect(findPackageFile(entries, 'CHANGELOG.md')).toBeNull()
    expect(findPackageFile(entries, 'package.json')).not.toBeNull()
  })
})
