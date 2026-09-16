import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  checkPluginStylesheet,
  MAX_PLUGIN_STYLESHEET_BYTES,
  type ResolvedPlugin,
} from '@cogenta/plugins'

/**
 * A plugin's own stylesheet (L32, after the lot's first honest limitation: a
 * block that cannot be styled is half a feature).
 *
 * What makes this safe enough to serve from the site's own origin is that it
 * is **static text from the package**, read once and checked, never generated
 * per request and never carrying a value someone typed. What the check
 * refuses, and why, lives with the plugin contract itself
 * (`checkPluginStylesheet`, `@cogenta/plugins`), so a plugin author's own
 * test can run the same function this host runs.
 *
 * A plugin whose stylesheet fails is served none: its markup still renders,
 * unstyled, and the site says why in its log.
 */

export { MAX_PLUGIN_STYLESHEET_BYTES }

export interface PluginStylesheet {
  readonly plugin: string
  readonly css: string
  /** Content digest — what the served URL carries, so a changed stylesheet is a changed URL. */
  readonly digest: string
}

export interface PluginStylesheetProblem {
  readonly plugin: string
  readonly reason: string
}

/** Where a plugin's stylesheet is served from — under the same reserved namespace its routes use. */
export function pluginStylesheetPath(plugin: string, digest: string): string {
  return `/_cogenta/plugins/${encodeURIComponent(plugin)}/styles.css?v=${digest.slice(0, 12)}`
}

/**
 * Reads and checks the stylesheet each plugin declares. Never throws: a
 * plugin with an unreadable or refused stylesheet is reported and skipped,
 * and the site starts.
 */
export async function loadPluginStylesheets(plugins: readonly ResolvedPlugin[]): Promise<{
  readonly sheets: readonly PluginStylesheet[]
  readonly problems: readonly PluginStylesheetProblem[]
}> {
  const sheets: PluginStylesheet[] = []
  const problems: PluginStylesheetProblem[] = []

  for (const plugin of plugins) {
    const declared = plugin.manifest.provides.styles
    if (declared === undefined) continue
    const name = plugin.manifest.name
    const target = resolve(plugin.packageRoot, declared)
    // The same containment rule the plugin's own entry file gets: a path that
    // leaves the package is refused before it is read.
    if (!target.startsWith(`${resolve(plugin.packageRoot)}${sep}`)) {
      problems.push({ plugin: name, reason: 'its stylesheet path leaves the package' })
      continue
    }
    const css = await readFile(target, 'utf8').catch(() => null)
    if (css === null) {
      problems.push({ plugin: name, reason: `no stylesheet at ${join(declared)}` })
      continue
    }
    const checked = checkPluginStylesheet(css)
    if (!checked.ok) {
      problems.push({ plugin: name, reason: checked.reason ?? 'refused' })
      continue
    }
    sheets.push({
      plugin: name,
      css,
      digest: createHash('sha256').update(css).digest('hex'),
    })
  }

  return { sheets, problems }
}
