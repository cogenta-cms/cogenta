import { dirname, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import {
  createDatabaseRegistry,
  createLogger,
  createStorageRegistry,
  isCogentaError,
  type Logger,
  loadConfig,
  type StorageDriver,
} from '@cogenta/core'
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
  type InstalledPlugins,
  loadInstalledPlugins,
  type ResolvedPlugin,
  readPluginCode,
  runPlugin,
} from '@cogenta/plugins'
import { createContentStore, createSchemaTables } from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadCollections } from './serve.js'

/**
 * `cogenta plugin` — the hand path onto the plugin runtime (L31 step 1).
 *
 * Until this command, `@cogenta/plugins` was a complete runtime nothing ever
 * called: no site had a place to put a plugin, no loader read a plugin's
 * code, and `runPlugin` had no caller outside its own tests. This is the
 * smallest honest way to close that — list what a site has installed, check
 * one before trusting it, grant it a capability, and actually run it against
 * the site's real database and storage.
 *
 * Every capability reaching the sandbox still comes from a real grant row:
 * this command has no flag that hands a plugin a capability for one run.
 * Granting is its own subcommand precisely so that it is a decision someone
 * takes, recorded, and revocable — never a side effect of running something.
 */

const USAGE = `Usage
  cogenta plugin list
  cogenta plugin check <name|path>
  cogenta plugin grant <name> <capability>
  cogenta plugin revoke <name> <capability>
  cogenta plugin run <name> [--invoke <handler>] [--input '<json>'] [--collection <name>]

Plugins live in one directory per plugin under "plugins/" (configurable with
plugins.dir), each holding a plugin.manifest.* and the file its "main" names.

A plugin only ever gets the capabilities it has been granted: "grant" records
one, "revoke" takes it back, and "run" reads them from the site's database. A
run that exceeds its time or memory budget disables the plugin until a human
re-enables it.
`

export interface PluginCommandOptions {
  readonly subcommand: string | undefined
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** The handler to call inside the plugin (`--invoke`). */
  readonly invoke?: string
  /** JSON payload for that handler (`--input`). */
  readonly input?: string
  /** The collection a granted `content.read` reads from (`--collection`). */
  readonly collection?: string
}

function describe(plugin: ResolvedPlugin): string {
  const trust = plugin.devMode
    ? 'unsigned (local)'
    : plugin.signatureVerified
      ? 'signed'
      : 'unverified'
  const code = plugin.entryPath === null ? 'no code' : plugin.entryPath
  // Nothing about engine compatibility is printed: `loadPlugin` has no real
  // Cogenta version to compare against yet (its own
  // `NO_REAL_ENGINE_VERSION_YET`), so every plugin would be reported as
  // mismatched — a false alarm is worse than silence.
  return `${plugin.manifest.name} ${plugin.manifest.version} [${trust}]\n    ${code}`
}

function report(out: Output, installed: InstalledPlugins): void {
  for (const plugin of installed.plugins) out.detail(describe(plugin))
  for (const failure of installed.failures) {
    out.warn(`${failure.directory}: ${failure.code} — ${failure.message}`)
  }
}

export async function runPluginCommand(options: PluginCommandOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })
  const subcommands = ['list', 'check', 'grant', 'revoke', 'run']

  if (options.subcommand === undefined) {
    stderr(`cogenta plugin needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (!subcommands.includes(options.subcommand)) {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
    return 2
  }

  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })
  const projectRoot =
    loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)
  const pluginsConfig = loaded.config.plugins

  let selection: Awaited<ReturnType<ReturnType<typeof createDatabaseRegistry>['select']>> | null =
    null
  let storage: { instance: StorageDriver; dispose(): Promise<void> } | null = null
  try {
    const installed = await loadInstalledPlugins({
      projectRoot,
      dir: pluginsConfig.dir,
    })

    if (options.subcommand === 'list') {
      if (!pluginsConfig.enabled) out.warn('Plugins are switched off in this site’s configuration.')
      if (installed.plugins.length === 0 && installed.failures.length === 0) {
        out.ok(`No plugin installed in ${installed.root}.`)
        return 0
      }
      out.ok(`${installed.plugins.length} plugin(s) in ${installed.root}:`)
      report(out, installed)
      return installed.failures.length > 0 ? 1 : 0
    }

    const name = options.args[0]
    if (name === undefined) {
      stderr(`cogenta plugin ${options.subcommand} needs a plugin name.\n\n${USAGE}`)
      return 2
    }

    const found = installed.plugins.find((plugin) => plugin.manifest.name === name)
    if (found === undefined) {
      const failure = installed.failures.find((item) => item.directory === name)
      if (failure !== undefined) {
        stderr(`${failure.code}: ${failure.message}\n`)
        return 1
      }
      stderr(`No plugin named "${name}" in ${installed.root}.\n`)
      return 1
    }

    if (options.subcommand === 'check') {
      out.ok(describe(found))
      out.detail(`capabilities requested: ${found.manifest.capabilities.join(', ') || 'none'}`)
      if (found.entryPath === null) {
        stderr('This plugin ships no code: nothing would run.\n')
        return 1
      }
      await readPluginCode(found.packageRoot, found.manifest)
      out.detail('its code reads, and its manifest validates')
      return 0
    }

    selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
    const db = selection.instance
    await ensurePluginTables(db)
    const grantStore = createPluginGrantStore(db)

    if (options.subcommand === 'grant' || options.subcommand === 'revoke') {
      const capability = options.args[1]
      if (capability === undefined) {
        stderr(`cogenta plugin ${options.subcommand} needs a capability.\n\n${USAGE}`)
        return 2
      }
      if (!found.manifest.capabilities.includes(capability)) {
        stderr(
          `"${name}" does not request "${capability}". It requests: ${
            found.manifest.capabilities.join(', ') || 'nothing'
          }.\n`,
        )
        return 1
      }
      if (options.subcommand === 'grant') {
        await grantStore.grant(name, capability)
        out.ok(`Granted "${capability}" to ${name}.`)
      } else {
        await grantStore.revoke(name, capability)
        out.ok(`Revoked "${capability}" from ${name}.`)
      }
      return 0
    }

    // run
    if (!pluginsConfig.enabled) {
      stderr('Plugins are switched off in this site’s configuration (plugins.enabled).\n')
      return 1
    }
    if (found.entryPath === null) {
      stderr(`"${name}" ships no code: there is nothing to run.\n`)
      return 1
    }

    const code = await readPluginCode(found.packageRoot, found.manifest)
    const grants = await grantStore.listGrants(name)
    const handlers: Record<string, CapabilityHandler> = {}

    if (grants.some((grant) => grant.capability === 'content.read')) {
      const collections = await loadCollections(projectRoot)
      const collectionName = options.collection ?? collections[0]?.name
      const collection = collections.find((item) => item.name === collectionName)
      if (collection === undefined) {
        stderr(
          `This plugin was granted content.read, but no collection was named. Pass --collection.\n`,
        )
        return 2
      }
      await createSchemaTables(db, collections)
      const store = createContentStore({
        db,
        collection,
        defaultLocale: loaded.config.site.defaultLocale,
      })
      // The published face, never a draft: a plugin reads what the site
      // shows, and an unpublished entry simply does not exist for it.
      handlers['content.read'] = createContentReadHandler(async (id) => store.read(id))
    }

    if (grants.some((grant) => grant.capability.startsWith('storage.'))) {
      storage = await createStorageRegistry({ logger }).select(loaded.config.storage)
      handlers['storage.read'] = createStorageReadHandler(storage.instance)
      handlers['storage.write'] = createStorageWriteHandler(storage.instance)
    }

    if (grants.some((grant) => grant.capability.startsWith('http.fetch'))) {
      handlers['http.fetch'] = createHttpFetchHandler()
    }

    let input: unknown
    if (options.input !== undefined) {
      try {
        input = JSON.parse(options.input)
      } catch {
        stderr('--input must be valid JSON.\n')
        return 2
      }
    }

    const result = await runPlugin(found.manifest, code, grants, {
      handlers,
      disableStore: createPluginDisableStore(db),
      usageStore: createPluginUsageStore(db),
      ...(options.invoke === undefined ? {} : { invoke: options.invoke }),
      ...(input === undefined ? {} : { input }),
      onPluginDisabled: (event) => {
        out.warn(`${event.pluginName} was disabled: ${event.reason}.`)
      },
    })

    if (!result.ok) {
      stderr(`${name} failed after ${result.durationMs} ms: ${result.error ?? 'unknown error'}\n`)
      return 1
    }
    out.ok(`${name} ran in ${result.durationMs} ms with ${grants.length} granted capability(ies).`)
    out.detail(JSON.stringify(result.value, null, 2))
    return 0
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  } finally {
    await storage?.dispose()
    await selection?.instance.close()
  }
}
