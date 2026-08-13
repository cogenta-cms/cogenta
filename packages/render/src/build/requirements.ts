import type { BlockRegistry, BlockRuntime } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type { ThemeManifest } from '../theme/manifest.js'

/**
 * The runtime-needs manifest of a build (ADR-0004, contract D "Besoins
 * runtime").
 *
 * Three kinds of thing declare a runtime need — a block, the theme, a plugin —
 * and all three are collected here, in one list, before any target is
 * considered. Collecting first and judging afterwards is deliberate: a build
 * that failed on the first offending block would send an operator round the
 * loop once per block, at 23:00, one `git push` at a time.
 */

/** Where a block that needs a runtime actually sits, so the message can say so. */
export interface RuntimePlacement {
  readonly route: string
  /** The block's `_key` — stable across reorders, so it stays quotable. */
  readonly key: string
}

export type RequirementOrigin = 'block' | 'theme' | 'plugin'

export interface RuntimeRequirement {
  readonly origin: RequirementOrigin
  readonly name: string
  readonly runtime: BlockRuntime
  /** Empty for a theme or a plugin: those apply to the whole site. */
  readonly placements: readonly RuntimePlacement[]
}

/** The minimum a build needs to know about a placed block. */
export interface BlockReference {
  readonly _key: string
  readonly _type: string
}

export interface BuildRoute {
  /** The path a visitor requests, `/blog/hello`. */
  readonly path: string
  readonly blocks: readonly BlockReference[]
}

export interface PluginRuntimeDeclaration {
  readonly name: string
  readonly runtime: BlockRuntime
}

export interface CollectRequirementsInput {
  readonly routes: readonly BuildRoute[]
  /** Resolves a block name to its definition. The vocabulary, plus what the site added. */
  readonly blocks: BlockRegistry
  readonly theme?: Pick<ThemeManifest, 'name' | 'runtime'> | undefined
  readonly plugins?: readonly PluginRuntimeDeclaration[] | undefined
}

/**
 * Everything in this build that needs something at request time.
 *
 * `static` needs are included rather than filtered out here: a caller that
 * wants only the problems asks for them against a target, and a caller that
 * wants to display the site's runtime profile gets the whole picture. Filtering
 * belongs to the judgement, not to the collection.
 */
export function collectRuntimeRequirements(
  input: CollectRequirementsInput,
): readonly RuntimeRequirement[] {
  const requirements: RuntimeRequirement[] = []

  if (input.theme !== undefined) {
    requirements.push({
      origin: 'theme',
      name: input.theme.name,
      runtime: input.theme.runtime,
      placements: [],
    })
  }

  for (const plugin of input.plugins ?? []) {
    requirements.push({
      origin: 'plugin',
      name: plugin.name,
      runtime: plugin.runtime,
      placements: [],
    })
  }

  // Grouped by block name, not by placement: "collectionList needs a server,
  // and here are the eleven pages that place it" is one decision to take.
  // Eleven separate lines would read as eleven problems.
  const byBlock = new Map<string, { runtime: BlockRuntime; placements: RuntimePlacement[] }>()

  for (const route of input.routes) {
    for (const block of route.blocks) {
      const definition = input.blocks.get(block._type)
      if (definition === undefined) {
        // Not skipped: an unknown block is exactly the case where guessing a
        // runtime would let a server-side block through a static build.
        throw new CogentaError({
          code: 'BLOCK_UNKNOWN',
          message: `The block "${block._type}" on ${route.path} is not registered, so its runtime needs are unknown.`,
          hint: `Register it — with a fallback, as contract B requires — before building. Known blocks: ${input.blocks.names().join(', ')}.`,
          details: { block: block._type, key: block._key, route: route.path },
        })
      }

      const entry = byBlock.get(definition.name)
      if (entry === undefined) {
        byBlock.set(definition.name, {
          runtime: definition.runtime,
          placements: [{ route: route.path, key: block._key }],
        })
      } else {
        entry.placements.push({ route: route.path, key: block._key })
      }
    }
  }

  for (const [name, entry] of byBlock) {
    requirements.push({
      origin: 'block',
      name,
      runtime: entry.runtime,
      placements: entry.placements,
    })
  }

  return requirements
}

/** The routes a given requirement makes impossible to render ahead of a request. */
export function routesOf(requirement: RuntimeRequirement): readonly string[] {
  const routes = new Set<string>()
  for (const placement of requirement.placements) routes.add(placement.route)
  return [...routes]
}
