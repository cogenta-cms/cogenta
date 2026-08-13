import type { BlockRuntime } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'

/**
 * The three delivery targets of ADR-0004, as a build parameter.
 *
 * One theme codebase, three Astro adapters. The target is chosen at build
 * time, never branched on inside a theme: a theme that renders differently
 * "because it is the static build" would make the acceptance criterion — the
 * same content produces an equivalent result on the three targets — unhold-
 * able, and would put the delivery profile back into the theme where the two
 * planes were meant to keep it out.
 */
export const BUILD_TARGETS = ['static', 'node', 'edge'] as const

export type BuildTarget = (typeof BUILD_TARGETS)[number]

export interface TargetAdapter {
  /** The Astro adapter this target is normally built with. */
  readonly recommended: string
  readonly alternatives: readonly string[]
}

export interface TargetCapability {
  readonly target: BuildTarget
  /** Human-readable, used in refusal messages read by someone tired. */
  readonly label: string
  /** The runtime needs this target can honour (contract D, "Besoins runtime"). */
  readonly satisfies: readonly BlockRuntime[]
  /** What `astro.config` must declare as `output` for this target. */
  readonly astroOutput: 'static' | 'server'
  /** `null` for static: there is no adapter, there is a directory of files. */
  readonly adapter: TargetAdapter | null
}

/**
 * What each target can actually do at request time.
 *
 * `static` satisfies `static` and nothing else — that is the whole point of a
 * static build, and the reason the refusal below exists.
 *
 * `node` and `edge` both satisfy the three, because both have a request. The
 * distinction between them is *where* the code runs, not whether a request
 * exists: a block that needs the database at request time is served fine by an
 * edge function calling the content API over HTTP (ADR-0016), which is exactly
 * why "deploy it as an edge function" is one of the three ways out we offer.
 */
export const TARGET_CAPABILITIES: Readonly<Record<BuildTarget, TargetCapability>> = {
  static: {
    target: 'static',
    label: 'static (HTML files on a CDN)',
    satisfies: ['static'],
    astroOutput: 'static',
    adapter: null,
  },
  node: {
    target: 'node',
    label: 'Node SSR (a Node server rendering on request)',
    satisfies: ['static', 'server', 'edge'],
    astroOutput: 'server',
    adapter: { recommended: '@astrojs/node', alternatives: [] },
  },
  edge: {
    target: 'edge',
    label: 'edge (functions at the CDN border)',
    satisfies: ['static', 'server', 'edge'],
    astroOutput: 'server',
    adapter: {
      recommended: '@astrojs/cloudflare',
      alternatives: ['@astrojs/vercel', '@astrojs/netlify'],
    },
  },
}

export function isBuildTarget(value: unknown): value is BuildTarget {
  return typeof value === 'string' && (BUILD_TARGETS as readonly string[]).includes(value)
}

/** Turns whatever the CLI or the configuration passed into a known target. */
export function resolveTarget(target: string): TargetCapability {
  if (!isBuildTarget(target)) {
    throw new CogentaError({
      code: 'BUILD_TARGET_UNKNOWN',
      message: `"${target}" is not a build target.`,
      hint: `Use one of: ${BUILD_TARGETS.join(', ')}.`,
      details: { target, known: BUILD_TARGETS },
    })
  }
  return TARGET_CAPABILITIES[target]
}

export function targetSatisfies(target: TargetCapability, runtime: BlockRuntime): boolean {
  return target.satisfies.includes(runtime)
}
