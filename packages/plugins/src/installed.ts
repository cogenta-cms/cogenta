import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { type LoadPluginOptions, loadPlugin, type ResolvedPlugin } from './loader.js'

/**
 * The plugins a site has installed (L31 step 1): one subdirectory per plugin
 * under `<projectRoot>/<dir>` (`plugins/` by default, `config.plugins.dir`).
 *
 * A directory, not a list in the configuration file: installing is copying a
 * folder, and uninstalling is deleting it, which is what a person expects and
 * what the marketplace installer already produces. The configuration only
 * says where to look and whether to look at all.
 *
 * Nothing here throws for a bad plugin. One broken manifest must not stop a
 * site from starting (R1): the failure is reported beside the plugins that
 * did load, for `cogenta plugin list` to print and for a later step to show
 * in the admin.
 */

export interface InstalledPluginFailure {
  /** The directory name, which is all that is known when the manifest itself is what failed. */
  readonly directory: string
  readonly path: string
  readonly code: string
  readonly message: string
}

export interface InstalledPlugins {
  readonly root: string
  readonly plugins: readonly ResolvedPlugin[]
  readonly failures: readonly InstalledPluginFailure[]
}

export interface LoadInstalledPluginsOptions extends LoadPluginOptions {
  /** Absolute path of the site. */
  readonly projectRoot: string
  /** Relative directory holding the plugins. Default: `plugins`. */
  readonly dir?: string
}

export async function loadInstalledPlugins(
  options: LoadInstalledPluginsOptions,
): Promise<InstalledPlugins> {
  const { projectRoot, dir = 'plugins', ...loadOptions } = options
  const root = resolve(projectRoot, dir)

  let entries: readonly string[]
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    // No plugins directory is the normal state of a site that has none.
    return { root, plugins: [], failures: [] }
  }

  const plugins: ResolvedPlugin[] = []
  const failures: InstalledPluginFailure[] = []
  for (const directory of entries) {
    const path = join(root, directory)
    try {
      plugins.push(await loadPlugin(path, loadOptions))
    } catch (error) {
      failures.push({
        directory,
        path,
        code: error instanceof CogentaError ? error.code : 'PLUGIN_MANIFEST_LOAD_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { root, plugins, failures }
}
