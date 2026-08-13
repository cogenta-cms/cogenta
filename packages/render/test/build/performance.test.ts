import { describe, expect, it } from 'vitest'
import type { BuildRoute } from '../../src/build/requirements.js'
import { runBuild } from '../../src/build/run-build.js'
import { block, blocks, staticTheme } from './fixtures.js'

/**
 * The acceptance criterion: a 1000-page static build in under three minutes.
 *
 * What is measured here is the build **orchestration** — collecting runtime
 * needs, planning every route, and driving the renderer over a thousand pages
 * — with a renderer that does the string work of a real page but none of its
 * I/O. That is the honest scope: the theme render and the content API round
 * trip belong to other tasks of this lot and would make this an integration
 * test against a live API.
 *
 * So the budget is split rather than claimed whole: the orchestration must fit
 * in a small fraction of the three minutes, leaving the rest to the renderer.
 * If this test ever fails, the build itself has become the bottleneck, which
 * is the regression it exists to catch.
 */

const PAGES = 1000

/** The whole criterion, in milliseconds. */
const TOTAL_BUDGET_MS = 3 * 60 * 1000

/**
 * The share the orchestration may take: 5% of the criterion, nine seconds.
 * Generous for what it does, tight enough that an accidental O(n²) — a linear
 * scan of the route list per route, say — blows through it well before it
 * would blow through the full budget.
 */
const ORCHESTRATION_BUDGET_MS = TOTAL_BUDGET_MS * 0.05

function thousandRoutes(): readonly BuildRoute[] {
  return Array.from({ length: PAGES }, (_, index) => ({
    path: `/article/${index}`,
    blocks: [
      block('hero', `h-${index}`),
      block('prose', `p-${index}`),
      block('mediaFigure', `m-${index}`),
      block('quote', `q-${index}`),
      block('cta', `c-${index}`),
    ],
  }))
}

describe('the static build budget', () => {
  it('orchestrates a 1000-page static build well inside the three-minute criterion', async () => {
    const routes = thousandRoutes()

    const result = await runBuild({
      target: 'static',
      routes,
      blocks,
      theme: staticTheme,
      render: (route) =>
        `<main data-route="${route.path}">${route.blocks
          .map((placed) => `<section data-block="${placed._type}"></section>`)
          .join('')}</main>`,
    })

    expect(result.pages.size).toBe(PAGES)
    expect(result.onDemand).toEqual([])
    expect(result.durationMs).toBeLessThan(ORCHESTRATION_BUDGET_MS)

    // Stated as a per-page figure too: this is the number that extrapolates,
    // and the one to compare against the renderer's own cost per page when
    // the real theme render lands.
    const perPageMs = result.durationMs / PAGES
    expect(perPageMs).toBeLessThan(ORCHESTRATION_BUDGET_MS / PAGES)
  })

  it('does not render pages one at a time', async () => {
    const routes = thousandRoutes().slice(0, 64)
    let inFlight = 0
    let peak = 0

    await runBuild({
      target: 'static',
      routes,
      blocks,
      theme: staticTheme,
      concurrency: 8,
      render: async (route) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        // A theme render is a wait on the content API, not a computation
        // (ADR-0016). Sequential prerendering would make a 1000-page build a
        // thousand sequential round trips.
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight -= 1
        return route.path
      },
    })

    expect(peak).toBe(8)
  })
})
