import type { DatabaseHandle, Logger, StorageDriver } from '@cogenta/core'
import {
  type CapabilityHandler,
  createContentReadHandler,
  createHttpFetchHandler,
  createPluginDisableStore,
  createPluginGrantStore,
  createPluginUsageStore,
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

export interface PluginRuntimeOptions {
  readonly projectRoot: string
  readonly dir: string
  readonly db: DatabaseHandle
  readonly storage: StorageDriver
  readonly logger: Logger
  /** Reads one published entry of a collection — what a granted `content.read` reaches. */
  readonly readEntry?: (collection: string, id: string) => Promise<unknown>
  readonly fetchImpl?: typeof fetch
}

export interface PluginRuntime {
  readonly plugins: readonly ResolvedPlugin[]
  readonly failures: readonly InstalledPluginFailure[]
  /** How many plugins subscribe to at least one content event. */
  readonly subscribers: number
  /** Hands the event to every plugin that subscribed to it. Never rejects. */
  dispatchContentEvent(event: ContentLifecycleEvent): Promise<void>
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
  const subscribing: { plugin: ResolvedPlugin; code: string; events: readonly string[] }[] = []
  for (const plugin of installed.plugins) {
    const events = plugin.manifest.provides.eventSubscriptions ?? []
    if (events.length === 0 || plugin.entryPath === null) continue
    try {
      subscribing.push({
        plugin,
        code: await readPluginCode(plugin.packageRoot, plugin.manifest),
        events,
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

  async function dispatchContentEvent(event: ContentLifecycleEvent): Promise<void> {
    for (const { plugin, code, events } of subscribing) {
      if (!events.includes(event.event)) continue
      const name = plugin.manifest.name
      try {
        const grants = await grantStore.listGrants(name)
        const handlers: Record<string, CapabilityHandler> = {
          'storage.read': createStorageReadHandler(storage),
          'storage.write': createStorageWriteHandler(storage),
          'http.fetch': createHttpFetchHandler(options.fetchImpl ?? fetch),
        }
        if (options.readEntry !== undefined) {
          const readEntry = options.readEntry
          handlers['content.read'] = createContentReadHandler((id) =>
            readEntry(event.collection, id),
          )
        }
        const result = await runPlugin(plugin.manifest, code, grants, {
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

  return {
    plugins: installed.plugins,
    failures: installed.failures,
    subscribers: subscribing.length,
    dispatchContentEvent,
  }
}
