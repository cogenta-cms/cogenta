import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkForUpdates } from '../../src/update/check.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/update/', import.meta.url))

function fakeFetch(
  byPackage: Readonly<Record<string, { latest: string; tarballFile?: string }>>,
): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    for (const [name, config] of Object.entries(byPackage)) {
      const encoded = encodeURIComponent(name)
      if (url === `https://registry.npmjs.org/${encoded}`) {
        return new Response(
          JSON.stringify({
            'dist-tags': { latest: config.latest },
            versions: {
              [config.latest]: {
                version: config.latest,
                dist: { tarball: `https://registry.npmjs.org/t/${encoded}.tgz` },
              },
            },
          }),
          { status: 200 },
        )
      }
      if (url === `https://registry.npmjs.org/t/${encoded}.tgz`) {
        const bytes = await readFile(join(FIXTURES, config.tarballFile ?? 'no-changelog-1.0.0.tgz'))
        return new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.byteLength) },
        })
      }
    }
    return new Response(null, { status: 404 })
  }) as typeof fetch
}

function join(dir: string, file: string): string {
  return `${dir}${file}`
}

describe('checkForUpdates', () => {
  it('reports one status per package, with bump and contract risk', async () => {
    const report = await checkForUpdates({
      packages: [
        { name: '@cogenta/core', installed: '0.4.0' },
        { name: '@cogenta/fixture-test', installed: '1.2.1' },
      ],
      fetchImpl: fakeFetch({
        '@cogenta/core': { latest: '0.4.0' },
        '@cogenta/fixture-test': { latest: '1.2.3', tarballFile: 'cogenta-fixture-test-1.2.3.tgz' },
      }),
    })

    expect(report.updateAvailable).toBe(true)
    expect(report.highestBump).toBe('patch')
    expect(report.contractRiskDetected).toBe(true)

    const core = report.packages.find((pkg) => pkg.name === '@cogenta/core')
    expect(core?.updateAvailable).toBe(false)
    expect(core?.bump).toBe('none')
    expect(core?.contractRisk).toBeNull()

    const fixture = report.packages.find((pkg) => pkg.name === '@cogenta/fixture-test')
    expect(fixture?.updateAvailable).toBe(true)
    expect(fixture?.bump).toBe('patch')
    expect(fixture?.contractRisk?.warnings.length).toBeGreaterThan(0)
  })

  it('degrades one package to a checkError without failing the whole report', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('unreachable')) throw new Error('network down')
      return new Response(JSON.stringify({ 'dist-tags': { latest: '0.4.0' }, versions: {} }), {
        status: 200,
      })
    }) as typeof fetch

    const report = await checkForUpdates({
      packages: [
        { name: '@cogenta/core', installed: '0.4.0' },
        { name: '@cogenta/unreachable-pkg', installed: '1.0.0' },
      ],
      fetchImpl,
    })

    const broken = report.packages.find((pkg) => pkg.name === '@cogenta/unreachable-pkg')
    expect(broken?.latest).toBeNull()
    expect(broken?.checkError).toBeDefined()
    expect(broken?.updateAvailable).toBe(false)

    const ok = report.packages.find((pkg) => pkg.name === '@cogenta/core')
    expect(ok?.checkError).toBeUndefined()
  })

  it('skips the contract-risk fetch entirely when includeContractRisk is false', async () => {
    let tarballFetched = false
    const fetchImpl = (async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/t/')) {
        tarballFetched = true
        return new Response(null, { status: 200 })
      }
      return new Response(
        JSON.stringify({
          'dist-tags': { latest: '0.5.0' },
          versions: {
            '0.5.0': { version: '0.5.0', dist: { tarball: 'https://registry.npmjs.org/t/x.tgz' } },
          },
        }),
        { status: 200 },
      )
    }) as typeof fetch

    const report = await checkForUpdates({
      packages: [{ name: '@cogenta/core', installed: '0.4.0' }],
      fetchImpl,
      includeContractRisk: false,
    })

    expect(report.packages[0]?.updateAvailable).toBe(true)
    expect(report.packages[0]?.contractRisk).toBeNull()
    expect(tarballFetched).toBe(false)
  })
})
