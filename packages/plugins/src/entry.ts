import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { DEFAULT_PLUGIN_MAIN, type PluginManifest } from './manifest.js'

/**
 * A plugin's code, read from the file its manifest names (L31 step 1).
 *
 * Before this, `runPlugin` took a `code` string its caller had to find on its
 * own, and nothing in this repository could: a plugin had no entry point on
 * disk, so a real site had no way to run one. Reading is deliberately kept
 * apart from `loadPlugin`, which still executes nothing — reading a file is
 * not running it, and the two failures ("this plugin is unreadable" and "this
 * plugin threw") stay distinguishable.
 *
 * The path is resolved against the package root and then checked to still be
 * inside it: a manifest is data from wherever the plugin came from, so
 * `main: "../../etc/passwd"` is refused here as well as in validation.
 */

/** Refuses a plugin whose code is implausibly large before it is ever read into memory. */
export const MAX_PLUGIN_CODE_BYTES = 512 * 1024

export function pluginEntryPath(packageRoot: string, manifest: PluginManifest): string {
  const main = manifest.main ?? DEFAULT_PLUGIN_MAIN
  if (isAbsolute(main) || main.split(/[\\/]/u).includes('..')) {
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_INVALID',
      message: `Plugin "${manifest.name}" names an entry file outside its package: "${main}".`,
      hint: 'main must be a relative path inside the plugin package, such as "plugin.js".',
      details: { plugin: manifest.name, main },
    })
  }
  const path = resolve(packageRoot, main)
  const root = resolve(packageRoot)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_INVALID',
      message: `Plugin "${manifest.name}" resolves its entry file outside its package: "${main}".`,
      hint: 'main must be a relative path inside the plugin package, such as "plugin.js".',
      details: { plugin: manifest.name, main, resolved: path },
    })
  }
  return path
}

/** The code of a plugin, read from disk; throws with a named code rather than a bare filesystem error. */
export async function readPluginCode(
  packageRoot: string,
  manifest: PluginManifest,
  options: { readonly maxBytes?: number } = {},
): Promise<string> {
  const path = pluginEntryPath(packageRoot, manifest)
  const maxBytes = options.maxBytes ?? MAX_PLUGIN_CODE_BYTES
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    throw new CogentaError({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
      message: `Plugin "${manifest.name}" has no code at "${manifest.main ?? DEFAULT_PLUGIN_MAIN}".`,
      hint: "Create that file, or point `main` at the file that holds the plugin's code.",
      details: { plugin: manifest.name, path },
    })
  }
  if (size > maxBytes) {
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_INVALID',
      message: `Plugin "${manifest.name}" is ${size} bytes of code, over the ${maxBytes} byte limit.`,
      hint: 'Ship a built, minified entry file, or split the work into several plugins.',
      details: { plugin: manifest.name, size, maxBytes },
    })
  }
  return readFile(path, 'utf8')
}

/** The digest a signature covers, so signing a plugin covers its code and not only its manifest. */
export function pluginCodeDigest(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}
