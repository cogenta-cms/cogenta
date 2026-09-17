/**
 * What actually changed in a site's audience (L5 task 10, Analytics).
 *
 * Two thresholds, and both matter: a relative one, so a change has to be
 * large, and an absolute floor, so a page that went from two views to five is
 * never reported as "+150 %". Without the floor, a low-traffic site produces
 * nothing but noise — the exact failure mode L5 names as fatal for an agent.
 */

export type AudienceIssue = 'rise' | 'fall' | 'unvisited' | 'missing-page'

export interface AudiencePage {
  readonly path: string
  readonly views: number
}

export interface AudienceWindow {
  readonly totalViews: number
  readonly pages: readonly AudiencePage[]
}

export interface AudienceFinding {
  readonly issue: AudienceIssue
  readonly path: string
  readonly detail: string
  readonly views: number
}

export interface AudienceOptions {
  /** How much a page must move, as a ratio, to be worth a sentence. 0.5 = half again as much (or half as little). */
  readonly minimumChange?: number
  /** Views a page must reach in the better of the two windows before any change counts at all. */
  readonly minimumViews?: number
  /** Paths of published pages, so one with no views at all can be named. */
  readonly publishedPaths?: readonly string[]
  /** Paths the 404 log recorded, with their hit counts — a page people look for and do not find. */
  readonly notFound?: readonly AudiencePage[]
}

const DEFAULT_MINIMUM_CHANGE = 0.5
const DEFAULT_MINIMUM_VIEWS = 20

export function readAudienceSignals(
  current: AudienceWindow,
  previous: AudienceWindow,
  options: AudienceOptions = {},
): readonly AudienceFinding[] {
  const minimumChange = options.minimumChange ?? DEFAULT_MINIMUM_CHANGE
  const minimumViews = options.minimumViews ?? DEFAULT_MINIMUM_VIEWS
  const before = new Map(previous.pages.map((page) => [page.path, page.views]))
  const findings: AudienceFinding[] = []

  for (const page of current.pages) {
    const was = before.get(page.path) ?? 0
    if (Math.max(page.views, was) < minimumViews) continue
    if (was === 0) {
      findings.push({
        issue: 'rise',
        path: page.path,
        views: page.views,
        detail: `${page.views} views, against none in the window before.`,
      })
      continue
    }
    const change = (page.views - was) / was
    if (change >= minimumChange) {
      findings.push({
        issue: 'rise',
        path: page.path,
        views: page.views,
        detail: `${page.views} views against ${was}, a rise of ${Math.round(change * 100)} %.`,
      })
    } else if (change <= -minimumChange) {
      findings.push({
        issue: 'fall',
        path: page.path,
        views: page.views,
        detail: `${page.views} views against ${was}, a fall of ${Math.round(-change * 100)} %.`,
      })
    }
  }

  const visited = new Set(current.pages.map((page) => page.path))
  for (const path of options.publishedPaths ?? []) {
    if (visited.has(path)) continue
    findings.push({
      issue: 'unvisited',
      path,
      views: 0,
      detail: 'Published, and not visited once in this window.',
    })
  }

  for (const page of options.notFound ?? []) {
    if (page.views < minimumViews) continue
    findings.push({
      issue: 'missing-page',
      path: page.path,
      views: page.views,
      detail: `${page.views} visitors asked for this address and got nothing.`,
    })
  }

  return findings
}
