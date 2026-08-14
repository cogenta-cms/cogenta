import { describe, expect, it, vi } from 'vitest'
import { queryOsv } from '../../src/security/osv-client.js'
import type { SbomEntry } from '../../src/security/sbom.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('queryOsv', () => {
  it('returns nothing for a package with no vulns in the response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const entries: SbomEntry[] = [{ name: 'left-pad', version: '1.3.0', ecosystem: 'npm' }]

    const matches = await queryOsv(entries, { fetchImpl })

    expect(matches).toEqual([])
  })

  it('normalises a matched vulnerability, extracting a numeric CVSS score', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        vulns: [
          {
            id: 'GHSA-xxxx',
            summary: 'Prototype pollution',
            aliases: ['CVE-2021-23337'],
            severity: [{ type: 'CVSS_V3', score: '9.8' }],
          },
        ],
      }),
    )
    const entries: SbomEntry[] = [{ name: 'lodash', version: '4.17.15', ecosystem: 'npm' }]

    const matches = await queryOsv(entries, { fetchImpl })

    expect(matches).toEqual([
      {
        entry: entries[0],
        vulnerabilities: [
          {
            id: 'GHSA-xxxx',
            summary: 'Prototype pollution',
            aliases: ['CVE-2021-23337'],
            cvssScore: 9.8,
          },
        ],
      },
    ])
  })

  it('falls back to a qualitative severity band when no numeric score is present', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        vulns: [{ id: 'GHSA-yyyy', database_specific: { severity: 'HIGH' } }],
      }),
    )
    const entries: SbomEntry[] = [{ name: 'foo', version: '1.0.0', ecosystem: 'npm' }]

    const matches = await queryOsv(entries, { fetchImpl })

    expect(matches[0]?.vulnerabilities[0]?.cvssScore).toBe(7.5)
  })

  it('queries once per SBOM entry, with the package name/version/ecosystem in the body', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, _init?: RequestInit) =>
      jsonResponse(200, {}),
    )
    const entries: SbomEntry[] = [
      { name: 'a', version: '1.0.0', ecosystem: 'npm' },
      { name: 'b', version: '2.0.0', ecosystem: 'npm' },
    ]

    await queryOsv(entries, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const firstCallInit = fetchImpl.mock.calls[0]?.[1]
    const firstCallBody = JSON.parse(String(firstCallInit?.body ?? '{}'))
    expect(firstCallBody).toEqual({ version: '1.0.0', package: { name: 'a', ecosystem: 'npm' } })
  })

  it('throws SECURITY_OSV_QUERY_FAILED when the API responds with an error status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}))
    const entries: SbomEntry[] = [{ name: 'foo', version: '1.0.0', ecosystem: 'npm' }]

    await expect(queryOsv(entries, { fetchImpl })).rejects.toThrowError(/failed with status 500/)
  })
})
