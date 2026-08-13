import type { BlockRegistry } from '@cogenta/blocks'
import type { ThemeManifest } from '../theme/manifest.js'
import { assertRuntimeSatisfied } from './refusal.js'
import {
  type BuildRoute,
  collectRuntimeRequirements,
  type PluginRuntimeDeclaration,
  type RuntimeRequirement,
} from './requirements.js'
import { type BuildTarget, resolveTarget, type TargetCapability } from './targets.js'

/**
 * Deciding, before anything is rendered, how each route is produced.
 *
 * Two modes and no third: a route is either rendered ahead of time, or on
 * request. Incremental rendering is explicitly out of this lot — the tag-based
 * render cache has to be proven first — and leaving it out of the vocabulary
 * here is what keeps it out of the build.
 */

export type RouteMode = 'prerendered' | 'on-demand'

export interface PlannedRoute {
  readonly path: string
  readonly mode: RouteMode
  /** Names of the elements that forced `on-demand`. Empty for a prerendered route. */
  readonly needs: readonly string[]
}

export interface BuildPlan {
  readonly target: TargetCapability
  readonly routes: readonly PlannedRoute[]
  /** Every declared need in this build, static ones included. */
  readonly requirements: readonly RuntimeRequirement[]
}

export interface PlanBuildInput {
  readonly target: BuildTarget | TargetCapability
  readonly routes: readonly BuildRoute[]
  readonly blocks: BlockRegistry
  readonly theme?: Pick<ThemeManifest, 'name' | 'runtime'> | undefined
  readonly plugins?: readonly PluginRuntimeDeclaration[] | undefined
}

/**
 * Plans a build, or refuses it.
 *
 * The refusal happens here rather than at render time on purpose: the operator
 * learns that the build cannot work before a single page is produced, instead
 * of after nine hundred of them.
 */
export function planBuild(input: PlanBuildInput): BuildPlan {
  const target = typeof input.target === 'string' ? resolveTarget(input.target) : input.target

  const requirements = collectRuntimeRequirements({
    routes: input.routes,
    blocks: input.blocks,
    theme: input.theme,
    plugins: input.plugins,
  })

  assertRuntimeSatisfied(target, requirements)

  // Site-wide needs — the theme, a plugin — put every route on demand: there
  // is no page they do not touch.
  const siteWideNeeds = requirements
    .filter((requirement) => requirement.origin !== 'block' && requirement.runtime !== 'static')
    .map((requirement) => `${requirement.origin} ${requirement.name}`)

  const blockNeedsByRoute = new Map<string, string[]>()
  for (const requirement of requirements) {
    if (requirement.origin !== 'block' || requirement.runtime === 'static') continue
    for (const placement of requirement.placements) {
      const existing = blockNeedsByRoute.get(placement.route)
      const need = `block ${requirement.name}`
      if (existing === undefined) blockNeedsByRoute.set(placement.route, [need])
      else if (!existing.includes(need)) existing.push(need)
    }
  }

  const routes = input.routes.map((route): PlannedRoute => {
    const needs = [...siteWideNeeds, ...(blockNeedsByRoute.get(route.path) ?? [])]
    // On a static target this list is always empty — the refusal above
    // guarantees it — so the branch reads the same for the three targets.
    return needs.length === 0
      ? { path: route.path, mode: 'prerendered', needs: [] }
      : { path: route.path, mode: 'on-demand', needs }
  })

  return { target, routes, requirements }
}
