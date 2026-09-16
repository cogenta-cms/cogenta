import type { DatabaseHandle, Logger, StorageDriver } from '@cogenta/core'
import {
  type CapabilityHandler,
  createContentDeleteHandler,
  createContentPublishHandler,
  createContentReadHandler,
  createContentWriteDraftHandler,
  createHttpFetchHandler,
  createMediaReadHandler,
  createPluginDisableStore,
  createPluginGrantStore,
  createPluginUsageStore,
  createSchemaReadHandler,
  createStorageReadHandler,
  createStorageWriteHandler,
  ensurePluginTables,
  type InstalledPluginFailure,
  loadInstalledPlugins,
  type ResolvedPlugin,
  readPluginCode,
  runPlugin,
} from '@cogenta/plugins'
import type { ContentLifecycleEvent } from '@cogenta/schema'

/**
 * The plugins a running site loads, and the one thing they can react to
 * today: a content lifecycle event (L31 step 2).
 *
 * This is what `cogenta serve` was missing. The runtime itself has existed
 * since L7 — manifest, isolated worker, capability SDK, grants, disable on
 * violation — but nothing ever called it, so a plugin could not *do*
 * anything on a real site. `withLifecycleEvents` already emits exactly three
 * events (publish, unpublish, delete) through one hook that both REST and
 * GraphQL pass through; a plugin subscribes to them by naming them in its
 * manifest, and the site hands each one to the plugins that asked.
 *
 * Two rules this keeps:
 *
 * - **A plugin never breaks a write.** The event fires after the write landed;
 *   a plugin that throws, times out or is disabled is logged and skipped, and
 *   the publish it reacted to stays published. `dispatchContentEvent` cannot
 *   reject.
 * - **A capability still comes from a grant row.** The handlers below are
 *   built for every run, but `runPlugin` decides what reaches the sandbox from
 *   the plugin's real, persisted grants — a handler for an ungranted
 *   capability is simply never reachable.
 *
 * The code is read once, at startup: a site does not stat a plugin's file on
 * every publish, and editing a plugin means restarting the site, the same
 * rule its schema file already follows.
 */

/** The handler a subscribing plugin exposes; it receives the event as its payload. */
export const PLUGIN_EVENT_HANDLER = 'onContentEvent'

/** The handler a plugin serving a route exposes; it receives the request as its payload. */
export const PLUGIN_REQUEST_HANDLER = 'onRequest'

/** The handler a plugin with a schedule exposes; it receives `{ name }`. */
export const PLUGIN_SCHEDULE_HANDLER = 'onSchedule'

/** Every plugin route is mounted under this reserved prefix, never on a site's own paths. */
export const PLUGIN_ROUTE_PREFIX = '/_cogenta/plugins/'

/**
 * What a plugin may answer with. Deliberately not "headers": a plugin that
 * could set arbitrary headers could set a cookie on the site's own origin, or
 * a `content-disposition` that turns its answer into a download. It picks a
 * status, one content type from a known list, and a body — nothing else. The
 * host adds `cache-control: no-store`, because a plugin's answer is computed
 * per request and nothing here knows what it may safely cache.
 */
export const PLUGIN_CONTENT_TYPES = [
  'text/plain',
  'text/html',
  'application/json',
  'application/xml',
  'text/csv',
] as const

/** A plugin's answer, after the host has checked it. */
export interface PluginHttpResponse {
  readonly status: number
  readonly contentType: string
  readonly body: string
}

export interface PluginHttpRequest {
  readonly method: string
  /** The path inside the plugin's own namespace, e.g. `/hello`. */
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  /** The request body as text, or `null` for a GET. Capped by the host. */
  readonly body: string | null
}

/** Bodies larger than this are refused before a plugin ever sees them. */
export const MAX_PLUGIN_REQUEST_BODY_BYTES = 64 * 1024

/** And an answer larger than this is not served: a plugin cannot make the host hold it. */
export const MAX_PLUGIN_RESPONSE_BODY_BYTES = 1024 * 1024

/**
 * How many plugin runs may be in flight at once (L31 step 5, security
 * review). A plugin route is public and unauthenticated, and every request
 * spawns a worker with its own heap: without a ceiling, a thousand
 * simultaneous requests are a thousand workers and the site is gone. Past it,
 * the host answers 503 rather than queueing without bound — a plugin page
 * that is briefly unavailable is a smaller failure than a site that is.
 */
export const MAX_CONCURRENT_PLUGIN_RUNS = 8

export interface PluginRuntimeOptions {
  readonly projectRoot: string
  readonly dir: string
  readonly db: DatabaseHandle
  readonly storage: StorageDriver
  readonly logger: Logger
  /** Reads one published entry of a collection — what a granted `content.read` reaches. */
  readonly readEntry?: (collection: string, id: string) => Promise<unknown>
  /** Creates or updates the working face of an entry — `content.write_draft`, never publishing. */
  readonly writeDraft?: (input: {
    readonly collection: string
    readonly id?: string
    readonly values: Record<string, unknown>
  }) => Promise<unknown>
  /** Publishes an existing entry — `content.publish`. */
  readonly publishEntry?: (collection: string, id: string) => Promise<unknown>
  /** Moves an entry to the trash — `content.delete`, reversible since schema@2.0. */
  readonly trashEntry?: (collection: string, id: string) => Promise<unknown>
  /** One media item's metadata — `media.read`. */
  readonly readMedia?: (id: string) => Promise<unknown>
  /** The site's content model — `schema.read`. */
  readonly readSchema?: () => Promise<unknown>
  readonly fetchImpl?: typeof fetch
}

export interface PluginRuntime {
  readonly plugins: readonly ResolvedPlugin[]
  readonly failures: readonly InstalledPluginFailure[]
  /** How many plugins subscribe to at least one content event. */
  readonly subscribers: number
  /** Hands the event to every plugin that subscribed to it. Never rejects. */
  dispatchContentEvent(event: ContentLifecycleEvent): Promise<void>
  /** Every mounted route, as `<plugin name><path>` — what the site really exposes. */
  readonly routes: readonly string[]
  /**
   * Declares each plugin's scheduled work on the site's own registry, so it
   * runs on the same tick, takes the same multi-replica claim, and shows on
   * the "Tâches planifiées" screen where a person can run it by hand.
   */
  registerSchedules(registry: {
    register(definition: {
      name: string
      description: string
      intervalMs: number
      run: () => Promise<{ summary: string }>
    }): void
  }): void
  /**
   * Answers a request under `/_cogenta/plugins/`. `null` when no plugin
   * declared that path, so the host 404s exactly as it would for any unknown
   * URL; a plugin that fails answers 500 without leaking its error to the
   * visitor (it is logged instead).
   */
  handleRequest(pathname: string, request: PluginHttpRequest): Promise<PluginHttpResponse | null>
}

export async function createPluginRuntime(options: PluginRuntimeOptions): Promise<PluginRuntime> {
  const { db, logger, storage } = options
  const installed = await loadInstalledPlugins({
    projectRoot: options.projectRoot,
    dir: options.dir,
  })

  for (const failure of installed.failures) {
    logger.warn('plugin refused', {
      plugin: failure.directory,
      code: failure.code,
      error: failure.message,
    })
  }

  // Only a plugin that ships code and subscribes to something is worth
  // holding on to: everything else would be a file read on every publish for
  // nothing.
  const subscribing: {
    plugin: ResolvedPlugin
    code: string
    events: readonly string[]
    routes: readonly string[]
  }[] = []
  for (const plugin of installed.plugins) {
    const events = plugin.manifest.provides.eventSubscriptions ?? []
    const routes = plugin.manifest.provides.routes ?? []
    const schedules = plugin.manifest.provides.schedules ?? []
    if (
      (events.length === 0 && routes.length === 0 && schedules.length === 0) ||
      plugin.entryPath === null
    ) {
      continue
    }
    try {
      subscribing.push({
        plugin,
        code: await readPluginCode(plugin.packageRoot, plugin.manifest),
        events,
        routes,
      })
    } catch (error) {
      logger.warn('plugin code unreadable', {
        plugin: plugin.manifest.name,
        error: String(error),
      })
    }
  }

  if (subscribing.length > 0) await ensurePluginTables(db)
  const grantStore = createPluginGrantStore(db)
  const disableStore = createPluginDisableStore(db)
  const usageStore = createPluginUsageStore(db)
  /** Plugin runs in flight, bounded by `MAX_CONCURRENT_PLUGIN_RUNS`. */
  let running = 0

  function handlersFor(collection: string | null): Record<string, CapabilityHandler> {
    const handlers: Record<string, CapabilityHandler> = {
      'storage.read': createStorageReadHandler(storage),
      'storage.write': createStorageWriteHandler(storage),
      'http.fetch': createHttpFetchHandler(options.fetchImpl ?? fetch),
    }
    const readEntry = options.readEntry
    if (readEntry !== undefined && collection !== null) {
      handlers['content.read'] = createContentReadHandler((id) => readEntry(collection, id))
    }
    const writeDraft = options.writeDraft
    if (writeDraft !== undefined) {
      handlers['content.write_draft'] = createContentWriteDraftHandler(writeDraft)
    }
    const publishEntry = options.publishEntry
    if (publishEntry !== undefined) {
      handlers['content.publish'] = createContentPublishHandler((input) =>
        publishEntry(input.collection, input.id),
      )
    }
    const trashEntry = options.trashEntry
    if (trashEntry !== undefined) {
      handlers['content.delete'] = createContentDeleteHandler((input) =>
        trashEntry(input.collection, input.id),
      )
    }
    const readMedia = options.readMedia
    if (readMedia !== undefined) handlers['media.read'] = createMediaReadHandler(readMedia)
    const readSchema = options.readSchema
    if (readSchema !== undefined) handlers['schema.read'] = createSchemaReadHandler(readSchema)
    return handlers
  }

  async function dispatchContentEvent(event: ContentLifecycleEvent): Promise<void> {
    for (const { plugin, code, events } of subscribing) {
      if (!events.includes(event.event)) continue
      const name = plugin.manifest.name
      try {
        const grants = await grantStore.listGrants(name)
        const handlers = handlersFor(event.collection)
        const result = await runPlugin(plugin.manifest, code, grants, {
          onLog: (line) => logger.info('plugin log', { plugin: name, line }),
          invoke: PLUGIN_EVENT_HANDLER,
          input: event,
          handlers,
          disableStore,
          usageStore,
          onPluginDisabled: (disabled) =>
            logger.error('plugin disabled', { plugin: name, reason: disabled.reason }),
        })
        if (!result.ok) {
          logger.warn('plugin failed on a content event', {
            plugin: name,
            event: event.event,
            error: result.error ?? 'unknown error',
          })
        }
      } catch (error) {
        // A disabled plugin, an unreadable grant table: neither is the
        // business of the editor who just pressed Publish.
        logger.warn('plugin skipped on a content event', {
          plugin: name,
          event: event.event,
          error: String(error),
        })
      }
    }
  }

  /** The plugin and path a URL under the reserved prefix names, if any declared it. */
  function match(pathname: string): { entry: (typeof subscribing)[number]; path: string } | null {
    if (!pathname.startsWith(PLUGIN_ROUTE_PREFIX)) return null
    const rest = pathname.slice(PLUGIN_ROUTE_PREFIX.length)
    for (const entry of subscribing) {
      const name = entry.plugin.manifest.name
      // A scoped name carries its own slash (`@author/plugin`), so the plugin
      // is matched by name first and the remainder is its path.
      if (!rest.startsWith(name)) continue
      const path = rest.slice(name.length) || '/'
      if (entry.routes.includes(path)) return { entry, path }
    }
    return null
  }

  async function handleRequest(
    pathname: string,
    request: PluginHttpRequest,
  ): Promise<PluginHttpResponse | null> {
    const found = match(pathname)
    if (found === null) return null
    const { entry } = found
    const name = entry.plugin.manifest.name
    if (running >= MAX_CONCURRENT_PLUGIN_RUNS) {
      logger.warn('plugin route refused: too many runs in flight', { plugin: name })
      return {
        status: 503,
        contentType: 'text/plain',
        body: 'This page is busy. Try again in a moment.',
      }
    }
    running += 1
    try {
      const grants = await grantStore.listGrants(name)
      const result = await runPlugin(entry.plugin.manifest, entry.code, grants, {
        onLog: (line) => logger.info('plugin log', { plugin: name, line }),
        invoke: PLUGIN_REQUEST_HANDLER,
        input: { ...request, path: found.path },
        handlers: handlersFor(null),
        disableStore,
        usageStore,
        onPluginDisabled: (disabled) =>
          logger.error('plugin disabled', { plugin: name, reason: disabled.reason }),
      })
      if (!result.ok) {
        logger.warn('plugin failed serving a route', {
          plugin: name,
          path: found.path,
          error: result.error ?? 'unknown error',
        })
        return { status: 500, contentType: 'text/plain', body: 'This page could not be built.' }
      }
      return checkResponse(result.value)
    } catch (error) {
      logger.warn('plugin skipped serving a route', {
        plugin: name,
        path: found.path,
        error: String(error),
      })
      return { status: 500, contentType: 'text/plain', body: 'This page could not be built.' }
    } finally {
      running -= 1
    }
  }

  function registerSchedules(registry: {
    register(definition: {
      name: string
      description: string
      intervalMs: number
      run: () => Promise<{ summary: string }>
    }): void
  }): void {
    for (const entry of subscribing) {
      const pluginName = entry.plugin.manifest.name
      for (const schedule of entry.plugin.manifest.provides.schedules ?? []) {
        registry.register({
          name: `plugin:${pluginName}:${schedule.name}`,
          description: `Scheduled work of the plugin "${pluginName}".`,
          intervalMs: schedule.everyMinutes * 60_000,
          run: async () => {
            const grants = await grantStore.listGrants(pluginName)
            const result = await runPlugin(entry.plugin.manifest, entry.code, grants, {
              onLog: (line) => logger.info('plugin log', { plugin: pluginName, line }),
              invoke: PLUGIN_SCHEDULE_HANDLER,
              input: { name: schedule.name },
              handlers: handlersFor(null),
              disableStore,
              usageStore,
              onPluginDisabled: (disabled) =>
                logger.error('plugin disabled', { plugin: pluginName, reason: disabled.reason }),
            })
            // The registry records an error outcome from a rejection; a
            // plugin's own failure is exactly that, and saying so is what
            // makes the screen's "last run" honest.
            if (!result.ok) throw new Error(result.error ?? 'the plugin failed')
            return { summary: typeof result.value === 'string' ? result.value : 'ran' }
          },
        })
      }
    }
  }

  return {
    plugins: installed.plugins,
    failures: installed.failures,
    registerSchedules,
    subscribers: subscribing.filter((entry) => entry.events.length > 0).length,
    routes: subscribing.flatMap((entry) =>
      entry.routes.map((path) => `${entry.plugin.manifest.name}${path}`),
    ),
    dispatchContentEvent,
    handleRequest,
  }
}

/**
 * What a plugin returned, as the host is willing to serve it. Anything else —
 * a status outside the HTTP range, a content type not on the list, a body that
 * is not a string — becomes a plain 500 rather than a header a plugin got to
 * choose.
 */
function checkResponse(value: unknown): PluginHttpResponse {
  const invalid: PluginHttpResponse = {
    status: 500,
    contentType: 'text/plain',
    body: 'This page could not be built.',
  }
  if (value === null || typeof value !== 'object') return invalid
  const record = value as Record<string, unknown>
  const status = record['status'] ?? 200
  const contentType = record['contentType'] ?? 'text/html'
  const body = record['body'] ?? ''
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 599) {
    return invalid
  }
  if (
    typeof contentType !== 'string' ||
    !PLUGIN_CONTENT_TYPES.includes(contentType as (typeof PLUGIN_CONTENT_TYPES)[number])
  ) {
    return invalid
  }
  if (typeof body !== 'string') return invalid
  if (body.length > MAX_PLUGIN_RESPONSE_BODY_BYTES) {
    return {
      status: 500,
      contentType: 'text/plain',
      body: 'This page could not be built: the plugin answered with too much.',
    }
  }
  return { status, contentType, body }
}
