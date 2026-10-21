import type { TFunction } from 'i18next'
import { ApiError } from '../api/http.js'

/**
 * The host's checks speak English and sometimes name a directory of the
 * server; this screen speaks to someone who reads French and has no use for
 * the server's layout. A message the host is known to produce is said in
 * French; one it is not is shown as received, but never with an absolute
 * path in it.
 */

interface Rule {
  readonly pattern: RegExp
  readonly key: string
}

const RULES: readonly Rule[] = [
  { pattern: /is not valid JSON/u, key: 'plugins.problem.invalidJson' },
  { pattern: /does not hold a manifest object/u, key: 'plugins.problem.notAnObject' },
  { pattern: /No plugin manifest found/u, key: 'plugins.problem.noManifest' },
  { pattern: /is not a plugin manifest: a manifest is data/u, key: 'plugins.problem.noManifest' },
  { pattern: /^Plugin manifest .* is not valid:/u, key: 'plugins.problem.manifestInvalid' },
  { pattern: /Capabilities nothing implements yet/u, key: 'plugins.problem.unimplemented' },
  { pattern: /Its code does not evaluate/u, key: 'plugins.problem.notEvaluated' },
  { pattern: /does not return a set of handlers/u, key: 'plugins.problem.noHandlers' },
  { pattern: /subscribes to events but exposes no/u, key: 'plugins.problem.needsEventHandler' },
  { pattern: /declares routes but exposes no/u, key: 'plugins.problem.needsRouteHandler' },
  { pattern: /declares schedules but exposes no/u, key: 'plugins.problem.needsScheduleHandler' },
  { pattern: /has no code at/u, key: 'plugins.problem.noCode' },
]

/** Anything that looks like `/some/absolute/path/file.ext` becomes `file.ext`. */
export function withoutServerPaths(message: string): string {
  return message.replaceAll(/(?:[A-Za-z]:)?[\\/](?:[\w .@-]+[\\/])+([\w.@-]+)/gu, '$1')
}

/** The technical lines behind a refused manifest, one per problem. */
function detailsOf(message: string): string {
  const at = message.indexOf('\n')
  return at === -1 ? '' : withoutServerPaths(message.slice(at + 1).trim())
}

export function describePluginProblem(t: TFunction, message: string): string {
  const rule = RULES.find((candidate) => candidate.pattern.test(message))
  if (rule === undefined) return withoutServerPaths(message)
  return t(rule.key, { details: detailsOf(message) })
}

/** An error from the plugins API, in French when the host's code is one this screen knows. */
export function describePluginError(t: TFunction, caught: unknown, fallback: string): string {
  if (!(caught instanceof ApiError)) {
    return caught instanceof Error && caught.message !== ''
      ? describePluginProblem(t, caught.message)
      : fallback
  }
  const nothingSaved = caught.hint?.startsWith('Nothing was saved') === true
  const base = describePluginProblem(t, caught.message)
  return nothingSaved ? `${base} ${t('plugins.problem.nothingSaved')}` : base
}
