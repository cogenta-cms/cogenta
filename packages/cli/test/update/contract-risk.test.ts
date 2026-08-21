import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assessContractRisk } from '../../src/update/contract-risk.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/update/', import.meta.url))

function fakeFetch(bytes: Buffer, status = 200): typeof fetch {
  return (async () =>
    new Response(bytes, {
      status,
      headers: { 'content-length': String(bytes.byteLength) },
    })) as typeof fetch
}

describe('assessContractRisk', () => {
  it('scans a real tarball CHANGELOG.md for the versions between installed and target', async () => {
    const bytes = await readFile(`${FIXTURES}cogenta-fixture-test-1.2.3.tgz`)
    const result = await assessContractRisk({
      packageName: '@cogenta/fixture-test',
      fromVersion: '1.2.1',
      toVersion: '1.2.3',
      tarballUrl: 'https://registry.npmjs.org/fake.tgz',
      fetchImpl: fakeFetch(bytes),
    })

    expect(result.available).toBe(true)
    expect([...result.scannedVersions].sort()).toEqual(['1.2.2', '1.2.3'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.version).toBe('1.2.3')
    expect(result.warnings[0]?.excerpt).toContain('contract A')
  })

  it('excludes a version at or below fromVersion', async () => {
    const bytes = await readFile(`${FIXTURES}cogenta-fixture-test-1.2.3.tgz`)
    const result = await assessContractRisk({
      packageName: '@cogenta/fixture-test',
      fromVersion: '1.2.2',
      toVersion: '1.2.3',
      tarballUrl: 'https://registry.npmjs.org/fake.tgz',
      fetchImpl: fakeFetch(bytes),
    })
    expect(result.scannedVersions).toEqual(['1.2.3'])
  })

  it('is honest ("available: false") when the tarball has no CHANGELOG.md, never a false "no risk"', async () => {
    const bytes = await readFile(`${FIXTURES}no-changelog-1.0.0.tgz`)
    const result = await assessContractRisk({
      packageName: '@cogenta/fixture-nochangelog',
      fromVersion: '0.9.0',
      toVersion: '1.0.0',
      tarballUrl: 'https://registry.npmjs.org/fake.tgz',
      fetchImpl: fakeFetch(bytes),
    })
    expect(result.available).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.warnings).toEqual([])
  })

  it('is honest when the tarball cannot be downloaded at all', async () => {
    const result = await assessContractRisk({
      packageName: '@cogenta/core',
      fromVersion: '0.4.0',
      toVersion: '0.5.0',
      tarballUrl: 'https://registry.npmjs.org/fake.tgz',
      fetchImpl: fakeFetch(Buffer.from(''), 500),
    })
    expect(result.available).toBe(false)
    expect(result.reason).toContain('500')
  })

  it('refuses a tarball larger than the accepted size, by content-length alone', async () => {
    const fetchImpl = (async () =>
      new Response(Buffer.alloc(10), {
        status: 200,
        headers: { 'content-length': String(30 * 1024 * 1024) },
      })) as typeof fetch
    const result = await assessContractRisk({
      packageName: '@cogenta/core',
      fromVersion: '0.4.0',
      toVersion: '0.5.0',
      tarballUrl: 'https://registry.npmjs.org/fake.tgz',
      fetchImpl,
    })
    expect(result.available).toBe(false)
    expect(result.reason).toContain('larger')
  })
})
