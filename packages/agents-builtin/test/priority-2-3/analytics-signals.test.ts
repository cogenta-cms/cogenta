import { describe, expect, it } from 'vitest'
import { readAudienceSignals } from '../../src/analytics/signals.js'

describe('reading what really changed in an audience', () => {
  it('ignores a big percentage on a tiny volume, and keeps a real move', () => {
    const findings = readAudienceSignals(
      { totalViews: 320, pages: [{ path: '/noise', views: 5 }, { path: '/real', views: 300 }] },
      { totalViews: 202, pages: [{ path: '/noise', views: 2 }, { path: '/real', views: 200 }] },
    )

    expect(findings.map((finding) => finding.path)).toEqual(['/real'])
    expect(findings[0]?.issue).toBe('rise')
    expect(findings[0]?.detail).toContain('300 views against 200')
  })

  it('reports a fall with the same thresholds as a rise', () => {
    const findings = readAudienceSignals(
      { totalViews: 40, pages: [{ path: '/dropped', views: 40 }] },
      { totalViews: 200, pages: [{ path: '/dropped', views: 200 }] },
    )

    expect(findings[0]).toMatchObject({ issue: 'fall', path: '/dropped' })
  })

  it('names a published page nobody visited, and an address people ask for in vain', () => {
    const findings = readAudienceSignals(
      { totalViews: 100, pages: [{ path: '/seen', views: 100 }] },
      { totalViews: 100, pages: [{ path: '/seen', views: 100 }] },
      {
        publishedPaths: ['/seen', '/ignored'],
        notFound: [
          { path: '/old-address', views: 60 },
          { path: '/typo', views: 2 },
        ],
      },
    )

    expect(findings.map((finding) => `${finding.issue}:${finding.path}`)).toEqual([
      'unvisited:/ignored',
      'missing-page:/old-address',
    ])
  })

  it('says nothing when two windows look alike', () => {
    const window = { totalViews: 500, pages: [{ path: '/a', views: 300 }, { path: '/b', views: 200 }] }
    expect(readAudienceSignals(window, window)).toEqual([])
  })
})
