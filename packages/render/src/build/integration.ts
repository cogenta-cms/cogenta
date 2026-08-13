import { CogentaError } from '@cogenta/core'
import type { AstroIntegration } from 'astro'
import { assertRuntimeSatisfied } from './refusal.js'
import type { RuntimeRequirement } from './requirements.js'
import { type BuildTarget, resolveTarget, type TargetCapability } from './targets.js'

/**
 * The target, as an Astro integration.
 *
 * One theme codebase, three adapters (ADR-0008). This integration is the only
 * place that knows which of the three is being built: it sets Astro's `output`
 * and refuses the build if any declared runtime need cannot be honoured. The
 * adapter itself stays in the site's `astro.config`, because an adapter is a
 * dependency of the *deployment*, not of Cogenta — bundling one would force
 * every static site to install a Node server it will never run.
 */

export interface BuildTargetOptions {
  readonly target: BuildTarget | TargetCapability
  /**
   * The runtime needs of this build, or a function producing them.
   *
   * A function, because the route list generally comes from the content API
   * and the caller should not have to await it before declaring integrations.
   */
  readonly requirements?:
    | readonly RuntimeRequirement[]
    | (() => readonly RuntimeRequirement[] | Promise<readonly RuntimeRequirement[]>)
    | undefined
}

export function cogentaBuildTarget(options: BuildTargetOptions): AstroIntegration {
  const target = typeof options.target === 'string' ? resolveTarget(options.target) : options.target

  return {
    name: '@cogenta/render:build-target',
    hooks: {
      'astro:config:setup': async ({ updateConfig, logger }) => {
        const declared = options.requirements
        const requirements = typeof declared === 'function' ? await declared() : (declared ?? [])

        // Before anything else Astro might do, and before a single page is
        // rendered. A refusal after nine hundred pages is a refusal that cost
        // an hour to arrive at.
        assertRuntimeSatisfied(target, requirements)

        logger.info(`target ${target.target} — astro output: ${target.astroOutput}`)
        updateConfig({ output: target.astroOutput })
      },

      'astro:config:done': ({ config }) => {
        if (target.adapter === null || config.adapter !== undefined) return
        // Astro would fail on its own here, in its own words. Ours name the
        // package to install, which is the difference between a fix and a
        // search.
        throw new CogentaError({
          code: 'BUILD_TARGET_UNKNOWN',
          message: `The ${target.label} target needs an Astro adapter, and astro.config declares none.`,
          hint: `Install ${target.adapter.recommended}${
            target.adapter.alternatives.length === 0
              ? ''
              : ` (or ${target.adapter.alternatives.join(', ')})`
          } and set it as \`adapter\` in astro.config. A static build needs no adapter — use --target static if that is what you meant.`,
          details: {
            target: target.target,
            recommended: target.adapter.recommended,
            alternatives: target.adapter.alternatives,
          },
        })
      },
    },
  }
}
