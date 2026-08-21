import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { fetchNpmPackageSummary } from '../../src/update/npm-registry.js'

function fakeFetch(handler: (url: string) => { status: number; body?: unknown }): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const { status, body } = handler(url)
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }) as typeof fetch
}

describe('fetchNpmPackageSummary', () => {
  it('reads dist-tags.latest and per-version tarball URLs', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toContain('registry.npmjs.org/%40cogenta%2Fcore')
      return {
        status: 200,
        body: {
          'dist-tags': { latest: '0.5.0' },
          versions: {
            '0.4.0': {
              version: '0.4.0',
              dist: { tarball: 'https://registry.npmjs.org/t/0.4.0.tgz' },
            },
            '0.5.0': {
              version: '0.5.0',
              dist: { tarball: 'https://registry.npmjs.org/t/0.5.0.tgz' },
            },
          },
        },
      }
    })

    const summary = await fetchNpmPackageSummary('@cogenta/core', fetchImpl)
    expect(summary.latest).toBe('0.5.0')
    expect([...summary.versions].sort()).toEqual(['0.4.0', '0.5.0'])
    expect(summary.tarballUrl['0.5.0']).toBe('https://registry.npmjs.org/t/0.5.0.tgz')
  })

  it('throws UPDATE_CHECK_FAILED, not a raw fetch error, on a 404', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 404 }))
    await expect(fetchNpmPackageSummary('@cogenta/does-not-exist', fetchImpl)).rejects.toSatisfy(
      (error: unknown) => error instanceof CogentaError && error.code === 'UPDATE_CHECK_FAILED',
    )
  })

  it('throws UPDATE_CHECK_FAILED on a network failure', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as typeof fetch
    await expect(fetchNpmPackageSummary('@cogenta/core', fetchImpl)).rejects.toSatisfy(
      (error: unknown) => error instanceof CogentaError && error.code === 'UPDATE_CHECK_FAILED',
    )
  })

  it('throws UPDATE_CHECK_FAILED when the response carries no dist-tags.latest', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { versions: {} } }))
    await expect(fetchNpmPackageSummary('@cogenta/core', fetchImpl)).rejects.toSatisfy(
      (error: unknown) => error instanceof CogentaError && error.code === 'UPDATE_CHECK_FAILED',
    )
  })
})
