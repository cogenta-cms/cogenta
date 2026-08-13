import { CogentaError } from '@cogenta/core'
import { type BuildPlan, type PlanBuildInput, planBuild } from './plan.js'
import type { BuildRoute } from './requirements.js'
import type { BuildTarget } from './targets.js'

/**
 * Running a planned build.
 *
 * The renderer is injected, and it receives **only the route** — never the
 * target. That is not an oversight: it is what makes "the same content
 * produces an equivalent result on the three targets" a property of the code
 * rather than a promise in a document. A renderer that cannot see the target
 * cannot branch on it, so the only difference between the three targets is
 * *when* the render runs, never *what* it produces.
 */

export type RouteRenderer = (route: BuildRoute) => Promise<string> | string

export interface RunBuildInput extends PlanBuildInput {
  readonly render: RouteRenderer
  /**
   * Pages rendered at once during a prerender.
   *
   * A theme reads its content over HTTP (ADR-0016), so a prerender is mostly
   * waiting on round trips; rendering one page at a time makes a thousand-page
   * build a thousand sequential waits. Bounded rather than unbounded because
   * the content API is a plain server and a thousand parallel reads is an
   * outage, not a build.
   */
  readonly concurrency?: number | undefined
}

export interface BuildResult {
  readonly target: BuildTarget
  readonly plan: BuildPlan
  /** Paths rendered ahead of time, with their HTML. */
  readonly pages: ReadonlyMap<string, string>
  /** Paths left to be rendered on request. Always empty on the static target. */
  readonly onDemand: readonly string[]
  readonly durationMs: number
  /**
   * The HTML a visitor gets for `path`, through this target's production path:
   * a file for a prerendered route, a render for an on-demand one.
   */
  serve(path: string): Promise<string>
}

const DEFAULT_CONCURRENCY = 8

export async function runBuild(input: RunBuildInput): Promise<BuildResult> {
  const plan = planBuild(input)
  const byPath = indexRoutes(input.routes)

  const started = performance.now()
  const pages = new Map<string, string>()
  const onDemand: string[] = []

  const toPrerender: BuildRoute[] = []
  for (const planned of plan.routes) {
    const route = byPath.get(planned.path)
    if (route === undefined) continue
    if (planned.mode === 'prerendered') toPrerender.push(route)
    else onDemand.push(planned.path)
  }

  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, toPrerender.length) }, async () => {
    while (next < toPrerender.length) {
      const route = toPrerender[next++]
      if (route === undefined) return
      pages.set(route.path, await input.render(route))
    }
  })
  await Promise.all(workers)

  const durationMs = performance.now() - started

  return {
    target: plan.target.target,
    plan,
    pages,
    onDemand,
    durationMs,
    serve: async (path: string): Promise<string> => {
      const prerendered = pages.get(path)
      if (prerendered !== undefined) return prerendered
      const route = byPath.get(path)
      if (route === undefined) {
        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: `No route "${path}" in this build.`,
          hint: `The build produced ${plan.routes.length} route(s). Check the path, or the query that produced the route list.`,
          details: { path, target: plan.target.target },
        })
      }
      return await input.render(route)
    },
  }
}

function indexRoutes(routes: readonly BuildRoute[]): ReadonlyMap<string, BuildRoute> {
  const byPath = new Map<string, BuildRoute>()
  for (const route of routes) {
    if (byPath.has(route.path)) {
      // Refused rather than resolved: two routes on one path means one of the
      // two pages silently never ships, which is the class of bug this whole
      // module exists to prevent.
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: `Two routes claim the path "${route.path}".`,
        hint: 'A path is produced by exactly one route. Check for a duplicate slug, or for two collections routed to the same prefix.',
        details: { path: route.path },
      })
    }
    byPath.set(route.path, route)
  }
  return byPath
}
