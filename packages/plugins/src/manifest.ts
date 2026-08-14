import { CogentaError } from '@cogenta/core'

/**
 * `definePlugin` is the only door into the plugin model, mirroring
 * `defineCollection` (`@cogenta/schema`) — checked eagerly, at import time,
 * because every later L7 task (worker isolation, SDK capability
 * translation, the permission screen, signing) trusts this manifest
 * completely. A mistake caught here costs a restart; the same mistake
 * caught after a plugin is already granted capabilities costs a
 * compromised site — 90% of WordPress compromises go through a plugin
 * (docs/lots/L7-extensibilite.md § Objectif).
 *
 * Every issue is collected and reported at once (same reasoning as
 * `schemaError` in `@cogenta/schema`): fixing a manifest one refusal at a
 * time is a game of whack-a-mole an author shouldn't have to play.
 */

/** One thing wrong with a manifest, located by a dotted path. */
export interface PluginManifestIssue {
  readonly path: string
  readonly message: string
}

/**
 * A block a plugin provides outside the frozen contract B vocabulary. The
 * fallback is part of the SHAPE, not a separate later check: "un bloc sans
 * fallback est refusé" (docs/lots/L7-extensibilite.md § Manifeste) is a
 * property of what a block provision IS, not something bolted on after the
 * fact — carrying it here now avoids a breaking manifest-shape change once
 * block registration is actually built (a later task).
 */
export interface PluginBlockProvision {
  readonly name: string
  /** The vocabulary block (e.g. `prose`) a renderer falls back to when this plugin is absent or its block is unrecognised. */
  readonly fallback: string
}

/**
 * What a plugin brings, per "## Ce qu'un plugin peut apporter"
 * (docs/lots/L7-extensibilite.md, lines 38-46). The manifest example in the
 * lot doc only shows `tools`/`blocks`/`fields`/`channels`, but the
 * surrounding prose names drivers, skills and event subscriptions as
 * equally real things a plugin can provide — those slots are added here
 * now so a later task doesn't have to widen this shape under a frozen
 * contract. All optional: a plugin providing nothing new (e.g. a
 * pure-consumer integration) is a legitimate, empty `provides`.
 */
export interface PluginProvides {
  readonly tools?: readonly string[]
  readonly blocks?: readonly PluginBlockProvision[]
  readonly fields?: readonly string[]
  readonly channels?: readonly string[]
  readonly drivers?: readonly string[]
  readonly skills?: readonly string[]
  readonly eventSubscriptions?: readonly string[]
}

export const PLUGIN_RUNTIMES = ['server'] as const
export type PluginRuntime = (typeof PLUGIN_RUNTIMES)[number]

export interface PluginManifest {
  /** npm-scoped or plain package name, e.g. `@auteur/mon-plugin`. */
  readonly name: string
  /** Exact semver, e.g. `1.0.0`. */
  readonly version: string
  /** A semver range this plugin declares compatibility with, e.g. `^1.0.0`. */
  readonly engine: string
  /** Capability strings this plugin requests — see `PLUGIN_CAPABILITY_NAMES`. */
  readonly capabilities: readonly string[]
  readonly provides: PluginProvides
  readonly runtime: PluginRuntime
  /** Whether this plugin runs in an isolated worker (task 3) — which registry it may join is a later task's concern, not this schema's. */
  readonly isolated: boolean
}

/**
 * The known plugin capability vocabulary. Grounded in contract C's frozen
 * tool-permission taxonomy (`docs/04-contrats.md` § "Taxonomie des
 * permissions": `content.*`, `media.*`, `schema.read`, `site.config_*`,
 * `deps.*`, `build.trigger`, `deploy.trigger`, `http.fetch`,
 * `channel.send`, `agent.delegate`, `memory.*`) rather than a parallel
 * invention — a plugin providing an agent tool declares the same
 * permission names an agent's own tool manifest already uses. `storage.read`
 * / `storage.write` are added beyond contract C: plugins get their own
 * prefix-confined storage (a concept agents' tool taxonomy doesn't need),
 * and the lot doc's own manifest example (`storage.write:plugins/mon-plugin`)
 * requires it to exist.
 */
export const PLUGIN_CAPABILITY_NAMES = [
  'content.read',
  'content.write_draft',
  'content.publish',
  'content.delete',
  'media.read',
  'media.write',
  'schema.read',
  'site.config_read',
  'site.config_write',
  'deps.scan',
  'deps.patch',
  'build.trigger',
  'deploy.trigger',
  'http.fetch',
  'storage.read',
  'storage.write',
  'channel.send',
  'agent.delegate',
  'memory.read',
  'memory.write',
] as const
export type PluginCapabilityName = (typeof PLUGIN_CAPABILITY_NAMES)[number]

/**
 * Capabilities whose string carries a colon-suffixed parameter, per the
 * lot doc's own example (`http.fetch:api.exemple.com`,
 * `storage.write:plugins/mon-plugin`) — never a bare name, and never `*`.
 */
const PARAMETERIZED_CAPABILITIES: ReadonlySet<PluginCapabilityName> = new Set([
  'http.fetch',
  'storage.read',
  'storage.write',
  'channel.send',
])

const CAPABILITY_NAME_SET: ReadonlySet<string> = new Set(PLUGIN_CAPABILITY_NAMES)

/** Table-safe and consistent with how `defineCollection` guards collection names elsewhere in this workspace. */
const PACKAGE_NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9-]+$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
/** Deliberately loose: `^1.0.0`, `~1.2.3`, `>=1.0.0 <2.0.0`, or a bare `1.0.0`. */
const SEMVER_RANGE_PATTERN = /^[\^~]?\d+\.\d+\.\d+.*$/
/** A real hostname shape — no wildcard, no scheme, no path. */
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

/** The storage prefix a plugin's own capability grants — `plugins/<derived-name>`, scope stripped. */
function expectedStoragePrefix(pluginName: string): string {
  const derived = pluginName.includes('/')
    ? (pluginName.split('/').at(-1) ?? pluginName)
    : pluginName
  return `plugins/${derived}`
}

function isWithinOwnPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function checkCapability(
  raw: string,
  index: number,
  pluginName: string,
  issues: PluginManifestIssue[],
): void {
  const path = `capabilities[${index}]`
  const separatorIndex = raw.indexOf(':')
  const name = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex)
  const parameter = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1)

  if (!CAPABILITY_NAME_SET.has(name)) {
    issues.push({ path, message: `unknown capability "${name}"` })
    return
  }

  const requiresParameter = PARAMETERIZED_CAPABILITIES.has(name as PluginCapabilityName)

  if (!requiresParameter) {
    if (parameter !== undefined) {
      issues.push({ path, message: `"${name}" does not take a parameter, found "${raw}"` })
    }
    return
  }

  if (parameter === undefined || parameter.trim() === '') {
    issues.push({
      path,
      message: `"${name}" requires an explicit parameter, e.g. "${name}:example"`,
    })
    return
  }

  if (name === 'http.fetch') {
    if (parameter === '*') {
      issues.push({ path, message: '"http.fetch" must name an explicit domain, never "*"' })
    } else if (!HOSTNAME_PATTERN.test(parameter)) {
      issues.push({
        path,
        message: `"http.fetch" parameter "${parameter}" is not a valid hostname`,
      })
    }
    return
  }

  if (name === 'storage.read' || name === 'storage.write') {
    const prefix = expectedStoragePrefix(pluginName)
    if (!isWithinOwnPrefix(parameter, prefix)) {
      issues.push({
        path,
        message: `"${name}" must stay within this plugin's own prefix ("${prefix}"), found "${parameter}"`,
      })
    }
    return
  }
  // `channel.send:<channel>` — channel names are a runtime registry
  // (`@cogenta/channels`'s `createChannelRegistry`), not a fixed set this
  // schema can enumerate; a non-empty parameter is already checked above.
}

function checkProvidesBlocks(
  blocks: readonly PluginBlockProvision[] | undefined,
  issues: PluginManifestIssue[],
): void {
  if (blocks === undefined) return
  blocks.forEach((block, index) => {
    const path = `provides.blocks[${index}]`
    if (typeof block.name !== 'string' || block.name.trim() === '') {
      issues.push({ path: `${path}.name`, message: 'is required' })
    }
    if (typeof block.fallback !== 'string' || block.fallback.trim() === '') {
      issues.push({
        path: `${path}.fallback`,
        message: 'is required — a block without a fallback is refused',
      })
    }
  })
}

function collectIssues(input: PluginManifest): PluginManifestIssue[] {
  const issues: PluginManifestIssue[] = []

  if (typeof input.name !== 'string' || !PACKAGE_NAME_PATTERN.test(input.name)) {
    issues.push({
      path: 'name',
      message: 'must be a valid package name such as "@auteur/mon-plugin"',
    })
  }
  if (typeof input.version !== 'string' || !SEMVER_PATTERN.test(input.version)) {
    issues.push({ path: 'version', message: 'must be an exact semver version such as "1.0.0"' })
  }
  if (typeof input.engine !== 'string' || !SEMVER_RANGE_PATTERN.test(input.engine)) {
    issues.push({ path: 'engine', message: 'must be a semver range such as "^1.0.0"' })
  }
  if (!PLUGIN_RUNTIMES.includes(input.runtime)) {
    issues.push({ path: 'runtime', message: `must be one of: ${PLUGIN_RUNTIMES.join(', ')}` })
  }
  if (typeof input.isolated !== 'boolean') {
    issues.push({ path: 'isolated', message: 'is required' })
  }

  if (!Array.isArray(input.capabilities)) {
    issues.push({ path: 'capabilities', message: 'must be an array' })
  } else {
    input.capabilities.forEach((capability, index) => {
      if (typeof capability !== 'string' || capability.trim() === '') {
        issues.push({ path: `capabilities[${index}]`, message: 'must be a non-empty string' })
        return
      }
      checkCapability(capability, index, input.name, issues)
    })
  }

  if (input.provides === undefined || typeof input.provides !== 'object') {
    issues.push({
      path: 'provides',
      message: 'is required (an empty object is a valid "provides nothing")',
    })
  } else {
    checkProvidesBlocks(input.provides.blocks, issues)
  }

  return issues
}

/**
 * Validates and freezes a plugin manifest. Every hard-refusal rule the lot
 * specifies (`docs/lots/L7-extensibilite.md` § Manifeste) is enforced here:
 * `http.fetch` without an explicit domain, a storage capability outside the
 * plugin's own prefix, an unknown capability, and a block without a
 * fallback are all refused with a single, complete error listing every
 * issue at once — never a partial refusal an author has to rediscover one
 * `definePlugin` call at a time.
 */
export function definePlugin(input: PluginManifest): PluginManifest {
  const issues = collectIssues(input)
  if (issues.length > 0) {
    const lines = issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_INVALID',
      message: `Plugin manifest "${input.name ?? '(unnamed)'}" is not valid:\n${lines}`,
      hint: 'Fix the fields listed above and try again.',
      details: { name: input.name, issues },
    })
  }
  return Object.freeze(input)
}
