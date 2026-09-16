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
/**
 * The kinds a plugin block's field may take — contract B's own list
 * (`BLOCK_FIELD_KINDS`) plus `list`, a repeating group, which is what a
 * gallery, a comparison table or a set of steps is made of.
 *
 * Restated here rather than imported so that `@cogenta/plugins` does not take
 * a dependency on `@cogenta/blocks` to validate a manifest: the host that
 * turns a declaration into a real block definition owns that dependency, and
 * a test in `@cogenta/cli` asserts the two lists still agree.
 */
export const PLUGIN_BLOCK_FIELD_KINDS = [
  'text',
  'richText',
  'number',
  'boolean',
  'media',
  'select',
  'color',
  'json',
  'list',
] as const

export type PluginBlockFieldKind = (typeof PLUGIN_BLOCK_FIELD_KINDS)[number]

/**
 * One field of a plugin's block, declared as data.
 *
 * Data rather than code because the manifest is `plugin.manifest.json`, read
 * and never executed (L31's security review): a schema that had to be built
 * by calling functions would put manifest code back in the host process,
 * which is the exact hole that was closed.
 */
export interface PluginBlockFieldDeclaration {
  readonly kind: PluginBlockFieldKind
  readonly required?: boolean
  readonly localized?: boolean
  /** Shown to the person filling the block in. */
  readonly label?: string
  readonly help?: string
  /** Kind-specific settings, in the shape contract B's field builders expect. */
  readonly options?: Readonly<Record<string, unknown>>
  /** For `list` only: the fields one item of the list holds. Never nested twice. */
  readonly of?: Readonly<Record<string, PluginBlockFieldDeclaration>>
}

/**
 * A block a plugin provides outside the frozen contract B vocabulary. The
 * fallback is part of the SHAPE, not a separate later check: "un bloc sans
 * fallback est refusé" (docs/lots/L7-extensibilite.md § Manifeste) is a
 * property of what a block provision IS, not something bolted on after the
 * fact.
 *
 * L32 gives it what registering it actually needs: what to call it in an
 * editor, and the fields it holds. The block never joins the vocabulary —
 * contract B stays frozen — it is registered beside it, with the fallback
 * that keeps a page readable once the plugin is gone.
 */
export interface PluginBlockProvision {
  readonly name: string
  /** The vocabulary block (e.g. `prose`) a renderer falls back to when this plugin is absent or its block is unrecognised. */
  readonly fallback: string
  /**
   * Where the fallback block's own fields take their values from, as
   * `fallbackField: ownField`.
   *
   * Without this, falling back is a promise nobody can keep: a `countdown`'s
   * data does not satisfy `prose`'s schema, so "it degrades to prose" would
   * mean "it disappears". Naming the mapping makes the degradation something
   * a plugin author decided and a reader can check. A field the mapping does
   * not name is simply absent from the fallback, which is how an optional
   * field is meant to behave.
   */
  readonly fallbackFrom?: Readonly<Record<string, string>>
  /** What an editor calls it. Falls back to the name when absent. */
  readonly label?: string
  readonly fields?: Readonly<Record<string, PluginBlockFieldDeclaration>>
  /** Whether the block renders a heading of its own, as contract B's `a11y` states it. */
  readonly headingLevel?: 'none' | 'h2' | 'h3'
}

/**
 * A widget type a plugin provides (L32 step 4).
 *
 * Deliberately without a fallback, unlike a block: a widget is chrome, not
 * content. A block holds words someone wrote, so losing it would lose them;
 * a widget that cannot render simply is not drawn, its settings stay in the
 * database, and reinstalling the plugin brings it back exactly as it was.
 */
export interface PluginWidgetProvision {
  readonly name: string
  /** What an editor calls it. Falls back to the name when absent. */
  readonly label?: string
  readonly fields?: Readonly<Record<string, PluginBlockFieldDeclaration>>
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
  /**
   * Paths this plugin serves, each mounted under its own reserved namespace
   * (`/_cogenta/plugins/<name><path>`, L31 step 2). Declared rather than
   * inferred: what a plugin exposes publicly is the first thing a person
   * reviewing it should be able to read, and the host mounts nothing it was
   * not told about.
   */
  readonly routes?: readonly string[]
  /**
   * Work this plugin wants done on a cadence (L31 step 2). The host registers
   * one scheduled task per entry, beside the site's own, so it shows on the
   * "Tâches planifiées" screen and can be run by hand from there.
   *
   * A minimum of five minutes, because nothing here is a durable worker (R1):
   * tasks run when a tick finds them due, and a plugin asking for "every
   * second" would be asking for something this project does not have.
   */
  readonly schedules?: readonly PluginSchedule[]
  readonly blocks?: readonly PluginBlockProvision[]
  /** Widget types it adds to the areas a theme declares (L32 step 4). */
  readonly widgets?: readonly PluginWidgetProvision[]
  readonly fields?: readonly string[]
  readonly channels?: readonly string[]
  readonly drivers?: readonly string[]
  readonly skills?: readonly string[]
  readonly eventSubscriptions?: readonly string[]
}

/**
 * The content lifecycle events a plugin may subscribe to (L31 step 2).
 *
 * The same closed set `@cogenta/schema`'s `withLifecycleEvents` emits — named
 * here rather than imported, because this package deliberately depends on
 * `@cogenta/core` alone. A subscription to anything else is refused at
 * validation: a plugin waiting for an event no site ever emits would simply
 * never run, and never know why.
 */
export const PLUGIN_EVENT_NAMES = [
  'content.publish',
  'content.unpublish',
  'content.delete',
] as const
export type PluginEventName = (typeof PLUGIN_EVENT_NAMES)[number]

export interface PluginSchedule {
  readonly name: string
  readonly everyMinutes: number
}

/** Below this, a site would be running a plugin more often than it does its own work. */
export const MIN_PLUGIN_SCHEDULE_MINUTES = 5
/** A week: past this, a cadence is a calendar, and this scheduler is not one. */
export const MAX_PLUGIN_SCHEDULE_MINUTES = 7 * 24 * 60

export const PLUGIN_RUNTIMES = ['server'] as const
export type PluginRuntime = (typeof PLUGIN_RUNTIMES)[number]

export interface PluginManifest {
  /** npm-scoped or plain package name, e.g. `@auteur/mon-plugin`. */
  readonly name: string
  /**
   * What to call this plugin in front of a person — "Lettre d'information",
   * where `name` is `lettre-information`.
   *
   * Optional, and never an identifier: the name is what a directory, a grant
   * and an install target are keyed on, and it has to stay a package name.
   * Without this field an admin screen had to show the slug and a person had
   * to type one, which is how a plugin ended up being created by filling in a
   * folder name.
   */
  readonly title?: string
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
  /**
   * The file holding the plugin's code, relative to its package root
   * (L31 step 1). Default: `plugin.js`.
   *
   * Until L31 a plugin's code reached `runPlugin` as a string its caller had
   * found on its own, which is why nothing could run a plugin from disk and
   * why a signature could only ever cover the manifest. Naming the file here
   * is what makes both possible: the loader reads exactly this path, and a
   * signature covers the manifest *and* the bytes of this file.
   *
   * It stays inside the package: an absolute path or a `..` segment is
   * refused by validation, not merely discouraged.
   */
  readonly main?: string
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

/**
 * Capabilities that may name what they apply to, and mean "all of it" when
 * they do not (L31 step 3): `content.write_draft:article` writes drafts of
 * articles and nothing else, while a bare `content.write_draft` writes drafts
 * anywhere. Optional rather than required, because a plugin written before
 * this — and the bare form the lot doc itself shows — must keep validating.
 *
 * A narrower grant is the one a reviewer should be able to prefer, so the
 * handler re-checks the collection on every call, exactly as `http.fetch`
 * re-checks a hostname.
 */
const COLLECTION_SCOPED_CAPABILITIES: ReadonlySet<PluginCapabilityName> = new Set([
  'content.read',
  'content.write_draft',
  'content.publish',
  'content.delete',
])

/**
 * The capabilities a host in this repository can actually honour today
 * (L31 step 3). The rest of the vocabulary stays declarable — the names come
 * from contract C and describe real intentions — but granting one would hand
 * a plugin a method that does nothing, so `cogenta plugin grant` refuses it
 * and says which are real.
 */
export const IMPLEMENTED_CAPABILITY_NAMES: readonly PluginCapabilityName[] = [
  'content.read',
  'content.write_draft',
  'content.publish',
  'content.delete',
  'media.read',
  'schema.read',
  'http.fetch',
  'storage.read',
  'storage.write',
]

const IMPLEMENTED_SET: ReadonlySet<string> = new Set(IMPLEMENTED_CAPABILITY_NAMES)

/** Whether a capability string (with or without its parameter) is one a host can honour. */
export function isCapabilityImplemented(capability: string): boolean {
  const separator = capability.indexOf(':')
  return IMPLEMENTED_SET.has(separator === -1 ? capability : capability.slice(0, separator))
}

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
  const acceptsParameter = COLLECTION_SCOPED_CAPABILITIES.has(name as PluginCapabilityName)

  if (acceptsParameter && !requiresParameter) {
    if (parameter !== undefined && !COLLECTION_NAME_PATTERN.test(parameter)) {
      issues.push({
        path,
        message: `"${name}" takes a collection name, found "${parameter}"`,
      })
    }
    return
  }

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

/** The entry file a manifest names when it names none. */
export const DEFAULT_PLUGIN_MAIN = 'plugin.js'

/** A collection name, the same shape `defineCollection` accepts. */
const COLLECTION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

/** A scheduled task's name inside a plugin: lower case, digits and dashes. */
const SCHEDULE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A path a plugin serves, relative to its own namespace: `/hello`, `/feeds/latest`. */
const ROUTE_PATTERN = /^\/[A-Za-z0-9._~/-]*$/

/** A relative path inside the package, ending in a JavaScript extension. */
const MAIN_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:js|mjs|cjs)$/

function checkMain(main: string | undefined, issues: PluginManifestIssue[]): void {
  if (main === undefined) return
  const invalid =
    typeof main !== 'string' ||
    main.trim() === '' ||
    main.split('/').includes('..') ||
    !MAIN_PATTERN.test(main)
  if (invalid) {
    issues.push({
      path: 'main',
      message: 'must be a relative JavaScript file inside the package, such as "plugin.js"',
    })
  }
}

/** Contract B's own rule for a block name, restated for a declaration read from JSON. */
const BLOCK_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/
/** Past this a "block" is a page, and a form nobody can fill in. */
const MAX_PLUGIN_BLOCK_FIELDS = 24

function checkBlockFields(
  fields: Readonly<Record<string, PluginBlockFieldDeclaration>> | undefined,
  path: string,
  issues: PluginManifestIssue[],
  insideList: boolean,
): void {
  if (fields === undefined) return
  const names = Object.keys(fields)
  if (names.length > MAX_PLUGIN_BLOCK_FIELDS) {
    issues.push({ path, message: `must declare at most ${MAX_PLUGIN_BLOCK_FIELDS} fields` })
  }
  for (const [name, field] of Object.entries(fields)) {
    const fieldPath = `${path}.${name}`
    if (!BLOCK_NAME_PATTERN.test(name)) {
      issues.push({ path: fieldPath, message: 'must be a camelCase field name' })
    }
    if (!PLUGIN_BLOCK_FIELD_KINDS.includes(field?.kind as PluginBlockFieldKind)) {
      issues.push({
        path: `${fieldPath}.kind`,
        message: `must be one of ${PLUGIN_BLOCK_FIELD_KINDS.join(', ')}`,
      })
      continue
    }
    if (field.kind === 'list') {
      if (insideList) {
        issues.push({ path: fieldPath, message: 'a list cannot hold another list' })
        continue
      }
      if (field.of === undefined || Object.keys(field.of).length === 0) {
        issues.push({ path: `${fieldPath}.of`, message: 'a list must say what one item holds' })
        continue
      }
      checkBlockFields(field.of, `${fieldPath}.of`, issues, true)
    } else if (field.of !== undefined) {
      issues.push({ path: `${fieldPath}.of`, message: 'only a list declares "of"' })
    }
  }
}

function checkProvidesBlocks(
  blocks: readonly PluginBlockProvision[] | undefined,
  issues: PluginManifestIssue[],
): void {
  if (blocks === undefined) return
  const seen = new Set<string>()
  blocks.forEach((block, index) => {
    const path = `provides.blocks[${index}]`
    if (typeof block.name !== 'string' || !BLOCK_NAME_PATTERN.test(block.name)) {
      issues.push({
        path: `${path}.name`,
        message: 'must be a camelCase block name, such as "countdown"',
      })
    } else if (seen.has(block.name)) {
      issues.push({ path: `${path}.name`, message: 'is declared twice by this plugin' })
    } else {
      seen.add(block.name)
    }
    if (typeof block.fallback !== 'string' || block.fallback.trim() === '') {
      issues.push({
        path: `${path}.fallback`,
        message: 'is required — a block without a fallback is refused',
      })
    } else if (block.fallback === block.name) {
      issues.push({ path: `${path}.fallback`, message: 'cannot fall back on itself' })
    }
    if (block.fallbackFrom !== undefined) {
      const fields = block.fields ?? {}
      for (const [into, from] of Object.entries(block.fallbackFrom)) {
        if (typeof from !== 'string' || !(from in fields)) {
          issues.push({
            path: `${path}.fallbackFrom.${into}`,
            message: `must name one of this block's own fields (${Object.keys(fields).join(', ') || 'none declared'})`,
          })
        }
      }
    }
    if (block.label !== undefined && (typeof block.label !== 'string' || block.label.length > 80)) {
      issues.push({ path: `${path}.label`, message: 'must be a short name, at most 80 characters' })
    }
    if (
      block.headingLevel !== undefined &&
      !['none', 'h2', 'h3'].includes(block.headingLevel as string)
    ) {
      issues.push({ path: `${path}.headingLevel`, message: 'must be "none", "h2" or "h3"' })
    }
    checkBlockFields(block.fields, `${path}.fields`, issues, false)
  })
}

function checkProvidesWidgets(
  widgets: readonly PluginWidgetProvision[] | undefined,
  issues: PluginManifestIssue[],
): void {
  if (widgets === undefined) return
  const seen = new Set<string>()
  widgets.forEach((widget, index) => {
    const path = `provides.widgets[${index}]`
    if (typeof widget.name !== 'string' || !BLOCK_NAME_PATTERN.test(widget.name)) {
      issues.push({
        path: `${path}.name`,
        message: 'must be a camelCase widget type, such as "openingHours"',
      })
    } else if (seen.has(widget.name)) {
      issues.push({ path: `${path}.name`, message: 'is declared twice by this plugin' })
    } else {
      seen.add(widget.name)
    }
    if (
      widget.label !== undefined &&
      (typeof widget.label !== 'string' || widget.label.length > 80)
    ) {
      issues.push({ path: `${path}.label`, message: 'must be a short name, at most 80 characters' })
    }
    checkBlockFields(widget.fields, `${path}.fields`, issues, false)
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
  if (
    input.title !== undefined &&
    (typeof input.title !== 'string' || input.title.trim() === '' || input.title.length > 80)
  ) {
    issues.push({ path: 'title', message: 'must be a short human name, at most 80 characters' })
  }
  if (typeof input.version !== 'string' || !SEMVER_PATTERN.test(input.version)) {
    issues.push({ path: 'version', message: 'must be an exact semver version such as "1.0.0"' })
  }
  if (typeof input.engine !== 'string' || !SEMVER_RANGE_PATTERN.test(input.engine)) {
    issues.push({ path: 'engine', message: 'must be a semver range such as "^1.0.0"' })
  }
  checkMain(input.main, issues)
  for (const [index, schedule] of (input.provides?.schedules ?? []).entries()) {
    const path = `provides.schedules[${index}]`
    if (typeof schedule?.name !== 'string' || !SCHEDULE_NAME_PATTERN.test(schedule.name)) {
      issues.push({ path: `${path}.name`, message: 'must be a short name such as "daily-digest"' })
    }
    const minutes = schedule?.everyMinutes
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < MIN_PLUGIN_SCHEDULE_MINUTES ||
      minutes > MAX_PLUGIN_SCHEDULE_MINUTES
    ) {
      issues.push({
        path: `${path}.everyMinutes`,
        message: `must be a whole number of minutes between ${MIN_PLUGIN_SCHEDULE_MINUTES} and ${MAX_PLUGIN_SCHEDULE_MINUTES}`,
      })
    }
  }
  for (const [index, route] of (input.provides?.routes ?? []).entries()) {
    const path = `provides.routes[${index}]`
    if (
      typeof route !== 'string' ||
      !ROUTE_PATTERN.test(route) ||
      route.split('/').includes('..')
    ) {
      issues.push({
        path,
        message: 'must be a path starting with "/", such as "/hello" — no "..", no query string',
      })
    }
  }
  for (const [index, event] of (input.provides?.eventSubscriptions ?? []).entries()) {
    if (!PLUGIN_EVENT_NAMES.includes(event as PluginEventName)) {
      issues.push({
        path: `provides.eventSubscriptions[${index}]`,
        message: `unknown event "${event}" — one of ${PLUGIN_EVENT_NAMES.join(', ')}`,
      })
    }
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
    checkProvidesWidgets(input.provides.widgets, issues)
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
