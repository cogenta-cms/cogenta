import type { ToolContext } from '@cogenta/agents'
import { describe, expect, it, vi } from 'vitest'
import { createDepsScanTool } from '../../src/security/deps-scan-tool.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('deps.scan', () => {
  it('declares its permission and is read-only', () => {
    const tool = createDepsScanTool()
    expect(tool.permissions).toEqual(['deps.scan'])
    expect(tool.sideEffects).toBe(false)
  })

  it('returns an empty report when nothing is affected', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const tool = createDepsScanTool({ fetchImpl })

    const output = await tool.execute({ dependencies: { 'left-pad': '1.3.0' } }, CTX)

    expect(output.entries).toEqual([])
  })

  it('runs the full pipeline: OSV match, EPSS lookup, exploitability, report', async () => {
    const fetchImpl = vi.fn(async (url: string | Request | URL) => {
      const href = url.toString()
      if (href.includes('osv.dev')) {
        return jsonResponse(200, {
          vulns: [
            {
              id: 'GHSA-xxxx',
              summary: 'Prototype pollution',
              aliases: ['CVE-2021-23337'],
              severity: [{ type: 'CVSS_V3', score: '7.5' }],
            },
          ],
        })
      }
      return jsonResponse(200, {
        data: [{ cve: 'CVE-2021-23337', epss: '0.3', percentile: '0.9' }],
      })
    })
    const tool = createDepsScanTool({
      fetchImpl,
      now: () => new Date('2026-01-01T00:00:00.000Z').getTime(),
    })

    const output = await tool.execute({ dependencies: { lodash: '4.17.15' } }, CTX)

    expect(output.entries).toHaveLength(1)
    const entry = output.entries[0]
    expect(entry?.finding.package).toBe('lodash')
    expect(entry?.finding.assessment.urgency).toBe('high')
    expect(entry?.finding.assessment.epss).toBe(0.3)
    expect(entry?.isTheSiteExposed).toMatch(/activement exploitée/)
    expect(output.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does not query EPSS at all when no vulnerability was found', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}))
    const tool = createDepsScanTool({ fetchImpl })

    await tool.execute({ dependencies: { safe: '1.0.0' } }, CTX)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
