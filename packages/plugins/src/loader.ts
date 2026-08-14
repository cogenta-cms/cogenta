import { access, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CogentaError } from '@cogenta/core'
import { definePlugin, type PluginManifest } from './manifest.js'
import { satisfiesRange } from './semver.js'

/**
 * Where a resolved plugin came from — structural, not cosmetic: task 9
 * (signing) and the permissions screen's "avertissement permanent" both key
 * off this. A `local`/`git` plugin is allowed in development mode without a
 * signature; a `registry` plugin is not.
 */
export type PluginSource = 'registry' | 'local' | 'git'

/**
 * Checked in order, mirroring `@cogenta/core`'s `CONFIG_FILE_NAMES`
 * (`load-config.ts`) exactly — a plugin's manifest is a user-authored file
 * loaded the same way `cogenta.config.mjs`/`cogenta.schema.mjs` already are,
 * not a bespoke new mechanism.
 */
export const PLUGIN_MANIFEST_FILE_NAMES = [
  'plugin.manifest.ts',
  'plugin.manifest.mts',
  'plugin.manifest.js',
  'plugin.manifest.mjs',
] as const

export interface ResolvedPlugin {
  readonly manifest: PluginManifest
  readonly source: PluginSource
  /** Absolute path to the package root that was resolved. */
  readonly packageRoot: string
  /** Absolute path to the manifest file that was loaded. */
  readonly manifestPath: string
  /** Whether `manifest.engine` is satisfied by `engineVersion` (`loadPlugin`'s option). */
  readonly engineCompatible: boolean
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * A git reference: `git+https://...`, a bare `https://...\.git`, or the
 * `github:owner/repo` shorthand. Cloning it is a real network/filesystem
 * operation this task deliberately does not build — "résolution" here means
 * "recognise a git source and refuse honestly," not "implement a git
 * client." A local checkout of a git-sourced plugin is loaded exactly like
 * any other local path once it exists on disk.
 */
function isGitReference(reference: string): boolean {
  return (
    reference.startsWith('git+') ||
    reference.startsWith('github:') ||
    /^https?:\/\/.+\.git$/.test(reference)
  )
}

function looksLikeLocalPath(reference: string): boolean {
  return reference.startsWith('.') || reference.startsWith('/') || isAbsolute(reference)
}

async function findManifestFile(packageRoot: string): Promise<string> {
  for (const name of PLUGIN_MANIFEST_FILE_NAMES) {
    const candidate = join(packageRoot, name)
    if (await exists(candidate)) return candidate
  }
  throw new CogentaError({
    code: 'PLUGIN_MANIFEST_FILE_NOT_FOUND',
    message: `No plugin manifest found in ${packageRoot}.`,
    hint: `Add one of: ${PLUGIN_MANIFEST_FILE_NAMES.join(', ')}.`,
    details: { packageRoot },
  })
}

async function importManifest(manifestPath: string): Promise<PluginManifest> {
  let module: { default?: unknown }
  try {
    module = (await import(pathToFileURL(manifestPath).href)) as { default?: unknown }
  } catch (error) {
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_LOAD_FAILED',
      message: `Could not load ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
      hint: manifestPath.endsWith('.ts')
        ? 'A TypeScript manifest needs a Node runtime that strips types (Node 22.18+). Use plugin.manifest.mjs on an older one.'
        : 'Check the file for a syntax error, and that every import it uses is installed.',
      cause: error,
      details: { manifestPath },
    })
  }

  if (module.default === undefined) {
    throw new CogentaError({
      code: 'PLUGIN_MANIFEST_EXPORT_INVALID',
      message: `${manifestPath} has no default export.`,
      hint: 'Export the manifest as the default: `export default definePlugin({ … })`.',
      details: { manifestPath },
    })
  }

  // `definePlugin` re-validates even though a well-formed manifest module
  // already called it once at module-load time — a manifest file could
  // export a plain object instead of calling `definePlugin` itself, and
  // this is the only place that can catch that.
  return definePlugin(module.default as PluginManifest)
}

export interface LoadPluginOptions {
  /**
   * Cogenta's own version, checked against `manifest.engine`. No real,
   * meaningful Cogenta version exists anywhere yet (pre-alpha; the root
   * `package.json` carries no `version` field, and every workspace package
   * still uses the `0.0.0` placeholder) — `engineCompatible` is real and
   * correctly computed against whatever is passed here, but until a real
   * versioning scheme exists, pass a real Cogenta version explicitly when
   * one exists; the default below is a placeholder that makes every plugin
   * appear compatible, which is the honest behaviour of "no check exists
   * yet" rather than a fabricated pass/fail.
   */
  readonly engineVersion?: string
}

const NO_REAL_ENGINE_VERSION_YET = '0.0.0'

/**
 * Resolves a plugin reference to its package root and source kind, loads
 * and validates its manifest (via `definePlugin`), and reports engine
 * compatibility. Executes no plugin code beyond importing the
 * manifest-declaring module — spawning a worker to run the plugin's actual
 * runtime is task 3, not this one.
 */
export async function loadPlugin(
  reference: string,
  options: LoadPluginOptions = {},
): Promise<ResolvedPlugin> {
  const engineVersion = options.engineVersion ?? NO_REAL_ENGINE_VERSION_YET

  if (isGitReference(reference)) {
    throw new CogentaError({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
      message: `Git-sourced plugins are not resolvable yet: "${reference}".`,
      hint: 'Clone the repository locally and pass its local path instead.',
      details: { reference },
    })
  }

  const source: PluginSource = looksLikeLocalPath(reference) ? 'local' : 'registry'
  const packageRoot = await resolvePackageRoot(reference, source)
  const manifestPath = await findManifestFile(packageRoot)
  const manifest = await importManifest(manifestPath)

  return {
    manifest,
    source,
    packageRoot,
    manifestPath,
    engineCompatible: satisfiesRange(engineVersion, manifest.engine),
  }
}

async function resolvePackageRoot(reference: string, source: PluginSource): Promise<string> {
  if (source === 'local') {
    const stats = await stat(reference).catch(() => null)
    if (stats === null || !stats.isDirectory()) {
      throw new CogentaError({
        code: 'PLUGIN_SOURCE_NOT_FOUND',
        message: `No plugin directory at "${reference}".`,
        hint: 'Check the path — it must be an existing directory.',
        details: { reference },
      })
    }
    return reference
  }

  // A registry package name: resolved via Node's own ESM resolution, the
  // same mechanism any other workspace/npm dependency uses — no bespoke
  // registry client. `import.meta.resolve` throws `ERR_MODULE_NOT_FOUND` on
  // a package that is not installed, which is exactly the failure this task
  // needs to report.
  try {
    const resolvedUrl = import.meta.resolve(`${reference}/package.json`)
    return dirname(fileURLToPath(resolvedUrl))
  } catch (error) {
    throw new CogentaError({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
      message: `Could not resolve plugin package "${reference}": ${error instanceof Error ? error.message : String(error)}`,
      hint: 'Install the plugin package, or pass a local path instead.',
      cause: error,
      details: { reference },
    })
  }
}
