import { access, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CogentaError } from '@cogenta/core'
import { definePlugin, type PluginManifest } from './manifest.js'
import { satisfiesRange } from './semver.js'
import {
  readSignatureFile,
  TRUSTED_REGISTRY_PUBLIC_KEYS,
  verifyPluginSignature,
} from './signing/verify.js'

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
  /**
   * `true` only for a `local` (or, once resolvable, `git`) source: allowed
   * to run unsigned, "en mode développement" — the real datum a later admin
   * banner's "avertissement permanent" would render. A `registry` plugin is
   * never dev mode: it either verified or `loadPlugin` already refused it.
   */
  readonly devMode: boolean
  /** `true` only when a `registry` plugin's signature was checked and matched a trusted key. Always `false` in dev mode — there was nothing to check. */
  readonly signatureVerified: boolean
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
  /**
   * Base64 SPKI Ed25519 public keys this call trusts for `registry`-source
   * signature verification. Defaults to `TRUSTED_REGISTRY_PUBLIC_KEYS`
   * (`./signing/verify.js`) — empty until a real registry exists, so every
   * `registry` plugin fails verification by default rather than trusting a
   * placeholder key.
   */
  readonly trustedPublicKeys?: readonly string[]
}

const NO_REAL_ENGINE_VERSION_YET = '0.0.0'

/**
 * `source: 'registry'` is where "## Signature" (docs/lots/L7-extensibilite.md)
 * actually bites: "Une signature invalide bloque, sans possibilité de passer
 * outre depuis l'interface." There is deliberately no parameter here that
 * lets a caller force past a missing/invalid signature — the only way past
 * this function is a real, matching signature, because the override this
 * shape could otherwise offer is exactly what the lot's own line means by
 * "sans possibilité de passer outre." `local`/`git` sources skip
 * verification entirely, by design ("autorisé en mode développement"), and
 * are reported back as `devMode: true` for a future admin banner to render
 * as the "avertissement permanent" the lot also asks for.
 */
export async function resolveSignatureStatus(
  source: PluginSource,
  manifest: PluginManifest,
  manifestPath: string,
  trustedPublicKeys: readonly string[],
): Promise<{ readonly devMode: boolean; readonly signatureVerified: boolean }> {
  if (source !== 'registry') {
    return { devMode: true, signatureVerified: false }
  }

  const signature = await readSignatureFile(manifestPath)
  if (signature === null) {
    throw new CogentaError({
      code: 'PLUGIN_SIGNATURE_MISSING',
      message: `Plugin "${manifest.name}" has no signature file at ${manifestPath}.sig.`,
      hint: 'Registry plugins must be signed. Install from a local path for unsigned development use.',
      details: { pluginName: manifest.name, manifestPath },
    })
  }

  const verified = verifyPluginSignature(manifest, signature, trustedPublicKeys)
  if (!verified) {
    throw new CogentaError({
      code: 'PLUGIN_SIGNATURE_INVALID',
      message: `Plugin "${manifest.name}"'s signature does not match any trusted key.`,
      hint: 'The package may be tampered with, or its signing key is not (yet) trusted by this installation.',
      details: { pluginName: manifest.name, manifestPath },
    })
  }

  return { devMode: false, signatureVerified: true }
}

/**
 * Resolves a plugin reference to its package root and source kind, loads
 * and validates its manifest (via `definePlugin`), verifies its signature
 * when required, and reports engine compatibility. Executes no plugin code
 * beyond importing the manifest-declaring module — spawning a worker to run
 * the plugin's actual runtime is task 3, not this one.
 */
export async function loadPlugin(
  reference: string,
  options: LoadPluginOptions = {},
): Promise<ResolvedPlugin> {
  const engineVersion = options.engineVersion ?? NO_REAL_ENGINE_VERSION_YET
  const trustedPublicKeys = options.trustedPublicKeys ?? TRUSTED_REGISTRY_PUBLIC_KEYS

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
  const { devMode, signatureVerified } = await resolveSignatureStatus(
    source,
    manifest,
    manifestPath,
    trustedPublicKeys,
  )

  return {
    manifest,
    source,
    packageRoot,
    manifestPath,
    engineCompatible: satisfiesRange(engineVersion, manifest.engine),
    devMode,
    signatureVerified,
  }
}

/**
 * Resolves and loads a plugin the same way `loadPlugin` does, but treats it
 * as `registry`-trust **unconditionally**, whatever shape `packageRoot`
 * has — the marketplace's own stricter promise (L17, "jamais une confiance
 * implicite parce qu'elle vient du registre officiel") is stronger than
 * `loadPlugin`'s ordinary rule, which only requires a signature for a
 * reference that *looks* like a registry package name and lets a local path
 * run unsigned as "dev mode". A marketplace catalog entry's `reference` is
 * routinely a local directory (L17's own scoped choice: an embedded/local
 * catalog, not a real distant registry service, until L13 task 8's API keys
 * land) — without this function, every marketplace install of a local entry
 * would silently take the `local`/dev-mode branch and skip verification
 * entirely, which is exactly the shortcut the lot's own "pièges connus"
 * section forbids.
 *
 * Reuses `findManifestFile`/`importManifest`/`resolveSignatureStatus`
 * as-is — no re-implementation of manifest loading or signature checking,
 * only a different, stricter trust classification of the same pipeline.
 */
export async function loadMarketplacePlugin(
  packageRoot: string,
  options: LoadPluginOptions = {},
): Promise<ResolvedPlugin> {
  const engineVersion = options.engineVersion ?? NO_REAL_ENGINE_VERSION_YET
  const trustedPublicKeys = options.trustedPublicKeys ?? TRUSTED_REGISTRY_PUBLIC_KEYS

  const stats = await stat(packageRoot).catch(() => null)
  if (stats === null || !stats.isDirectory()) {
    throw new CogentaError({
      code: 'PLUGIN_SOURCE_NOT_FOUND',
      message: `No plugin directory at "${packageRoot}".`,
      hint: 'Check the marketplace catalog entry’s reference — it must be an existing directory.',
      details: { reference: packageRoot },
    })
  }

  const manifestPath = await findManifestFile(packageRoot)
  const manifest = await importManifest(manifestPath)
  const { devMode, signatureVerified } = await resolveSignatureStatus(
    'registry',
    manifest,
    manifestPath,
    trustedPublicKeys,
  )

  return {
    manifest,
    source: 'registry',
    packageRoot,
    manifestPath,
    engineCompatible: satisfiesRange(engineVersion, manifest.engine),
    devMode,
    signatureVerified,
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
