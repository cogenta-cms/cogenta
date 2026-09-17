import { describe, expect, it, vi } from 'vitest'
import {
  type AnalyticsSummaryPort,
  createAnalyticsSummaryTool,
} from '../../../src/tools/core/analytics.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:analytics', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakePort(): AnalyticsSummaryPort {
  return {
    summary: vi.fn(async (days) => ({
      since: `since-${days}`,
      until: 'until',
      totalViews: 900,
      uniqueVisitors: 400,
      topPages: [{ path: '/blog/hello', views: 500 }],
      previousTotalViews: 600,
    })),
  }
}

describe('analytics.summary', () => {
  it('reads a window of days and the one before it, so a change can be stated', async () => {
    const port = fakePort()
    const tool = createAnalyticsSummaryTool(port)

    const result = await tool.execute({ days: 14 }, CTX)

    expect(port.summary).toHaveBeenCalledWith(14)
    expect(result).toEqual({
      since: 'since-14',
      until: 'until',
      totalViews: 900,
      uniqueVisitors: 400,
      topPages: [{ path: '/blog/hello', views: 500 }],
      previousTotalViews: 600,
    })
  })

  it('defaults to a week, and refuses a window longer than a quarter', async () => {
    const port = fakePort()
    const tool = createAnalyticsSummaryTool(port)

    await tool.execute({}, CTX)

    expect(port.summary).toHaveBeenCalledWith(7)
    expect(tool.input.safeParse({ days: 365 }).success).toBe(false)
    expect(tool.input.safeParse({ days: 0 }).success).toBe(false)
  })

  it('reads and writes nothing, under its own permission', () => {
    const tool = createAnalyticsSummaryTool(fakePort())

    expect(tool.permissions).toEqual(['analytics.read'])
    expect(tool.sideEffects).toBe(false)
  })

  it('has no shape in which a visitor could be named', () => {
    const tool = createAnalyticsSummaryTool(fakePort())
    const shape = JSON.stringify(tool.output)

    for (const forbidden of ['ip', 'session', 'visitorId', 'userAgent', 'email']) {
      expect(shape.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})
