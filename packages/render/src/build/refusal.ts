import { CogentaError } from '@cogenta/core'
import { type RuntimeRequirement, routesOf } from './requirements.js'
import { BUILD_TARGETS, TARGET_CAPABILITIES, type TargetCapability } from './targets.js'

/**
 * The refusal.
 *
 * This is the most important text in the build. It is read by someone who has
 * just been told their deploy failed, usually late, usually without the
 * architecture document open. So it names three things and nothing else:
 * **what** element is at fault, **why** the target cannot carry it, and the
 * **three** ways out — an edge function, an external service, or removal.
 *
 * What it deliberately does not do is degrade. Rendering the page without the
 * block, or freezing a snapshot of it at build time, would ship a site that is
 * quietly wrong; the operator would find out from a reader.
 */

/** Beyond this, placements are counted rather than listed: a wall of paths is not read. */
const MAX_PLACEMENTS_SHOWN = 5

export function unsatisfiedRequirements(
  target: TargetCapability,
  requirements: readonly RuntimeRequirement[],
): readonly RuntimeRequirement[] {
  return requirements.filter((requirement) => !target.satisfies.includes(requirement.runtime))
}

/** Targets that would carry every one of these needs. Feeds option 1. */
export function targetsThatCanCarry(
  requirements: readonly RuntimeRequirement[],
  except: TargetCapability,
): readonly TargetCapability[] {
  return BUILD_TARGETS.map((name) => TARGET_CAPABILITIES[name]).filter(
    (candidate) =>
      candidate.target !== except.target &&
      requirements.every((requirement) => candidate.satisfies.includes(requirement.runtime)),
  )
}

/** Why a build-time-only target cannot carry this need, in the operator's terms. */
function reasonFor(requirement: RuntimeRequirement): string {
  const what =
    requirement.runtime === 'server'
      ? 'a server at request time'
      : 'a function running at request time'
  const noun = requirement.origin === 'block' ? 'This block' : `This ${requirement.origin}`
  return (
    `${noun} declares runtime: ${requirement.runtime}, meaning it needs ${what} — ` +
    'it is rendered from data read when the page is asked for. A static build ' +
    'renders every page once and then serves files, so the only thing it could ' +
    'ship is a snapshot, wrong from the first content change after the build.'
  )
}

function describePlacements(requirement: RuntimeRequirement): string {
  if (requirement.placements.length === 0) {
    return 'Applies to the whole site.'
  }
  const shown = requirement.placements
    .slice(0, MAX_PLACEMENTS_SHOWN)
    .map((placement) => `${placement.route} (block ${placement.key})`)
  const hidden = requirement.placements.length - shown.length
  const routes = routesOf(requirement).length
  const tail = hidden > 0 ? `, and ${hidden} more` : ''
  return `Placed ${requirement.placements.length} time(s) on ${routes} route(s): ${shown.join(', ')}${tail}.`
}

function removalFor(requirement: RuntimeRequirement): string {
  switch (requirement.origin) {
    case 'block':
      return `remove the "${requirement.name}" blocks listed above from their pages`
    case 'theme':
      return `use a theme declaring runtime: static, or ask the author of "${requirement.name}" for one`
    case 'plugin':
      return `uninstall the plugin "${requirement.name}"`
  }
}

/**
 * The message a human reads. Kept separate from the error so it can be
 * asserted verbatim in a test: a refusal whose wording drifts is a refusal
 * nobody can act on, and this project treats the wording as the deliverable.
 */
export function formatRuntimeRefusal(
  target: TargetCapability,
  unsatisfied: readonly RuntimeRequirement[],
): string {
  const capable = targetsThatCanCarry(unsatisfied, target)
  const lines: string[] = []

  lines.push(
    `Build refused for the ${target.label} target: ${unsatisfied.length} element(s) need a runtime it cannot provide.`,
  )
  lines.push('')

  for (const requirement of unsatisfied) {
    lines.push(`  ${requirement.origin} "${requirement.name}" — runtime: ${requirement.runtime}`)
    lines.push(`    Why: ${reasonFor(requirement)}`)
    lines.push(`    Where: ${describePlacements(requirement)}`)
    lines.push('')
  }

  lines.push('Three ways out, and there is no fourth:')
  lines.push('')
  lines.push(
    capable.length === 0
      ? '  1. Serve these pages from a request-time target. No configured target carries these needs, which means the need itself has to change.'
      : `  1. Build for a target that has a request: ${capable
          .map((candidate) => `--target ${candidate.target}`)
          .join(' or ')}. ` +
          'Edge keeps the CDN in front and runs only these pages as functions; Node needs a process you keep alive.',
  )
  lines.push(
    '  2. Move the work to an external service the browser calls after load — a search endpoint, a comments service, a listing API. The page stays static and the element is replaced by that integration.',
  )
  lines.push(
    `  3. Remove the element from this site: ${unsatisfied.map(removalFor).join('; ')}. The content itself is untouched either way.`,
  )

  return lines.join('\n')
}

/** Throws unless every declared runtime need is one this target can honour. */
export function assertRuntimeSatisfied(
  target: TargetCapability,
  requirements: readonly RuntimeRequirement[],
): void {
  const unsatisfied = unsatisfiedRequirements(target, requirements)
  if (unsatisfied.length === 0) return

  const runtimes = [...new Set(unsatisfied.map((requirement) => requirement.runtime))]
  throw new CogentaError({
    code: 'BUILD_RUNTIME_UNSATISFIED',
    message: formatRuntimeRefusal(target, unsatisfied),
    hint: 'Build for a target with a request (--target edge or --target node), replace the element with an external service, or remove it. The message above names each element and where it sits.',
    details: {
      target: target.target,
      runtimes,
      elements: unsatisfied.map((requirement) => ({
        origin: requirement.origin,
        name: requirement.name,
        runtime: requirement.runtime,
        routes: routesOf(requirement),
      })),
    },
  })
}
