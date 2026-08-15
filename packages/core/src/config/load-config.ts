import { access } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { CogentaError } from '../errors/index.js'
import { resolveConfig } from './resolve-config.js'
import type { CogentaConfig, Environment } from './types.js'

/** Checked in order, so a TypeScript config wins over a compiled one. */
export const CONFIG_FILE_NAMES = [
  'cogenta.config.ts',
  'cogenta.config.mts',
  'cogenta.config.js',
  'cogenta.config.mjs',
] as const

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Walks up from `cwd` looking for a config file, the way a package manager
 * looks for a lockfile. Running the CLI from a subdirectory of a project is
 * normal, and failing there would be a papercut on every single use.
 */
export async function findConfigFile(cwd: string = process.cwd()): Promise<string | null> {
  let directory = resolvePath(cwd)

  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(directory, name)
      if (await exists(candidate)) return candidate
    }

    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

export interface LoadConfigOptions {
  readonly cwd?: string
  readonly env?: Environment
  /** Skip the search and load exactly this file. */
  readonly path?: string
}

export interface LoadedConfig {
  readonly config: CogentaConfig
  /** Null when the configuration came from the environment alone. */
  readonly path: string | null
}

/**
 * Finds, imports and resolves the configuration.
 *
 * A missing config file is **not** an error: an environment with
 * `COGENTA_SITE_URL` and `DATABASE_URL` set is a legitimate way to run, and it
 * is how a container is usually configured. What fails is a configuration that
 * cannot produce a valid result, and it fails naming the fields.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const path = options.path ?? (await findConfigFile(options.cwd))

  const env = options.env ?? process.env

  // `create-cogenta` writes a real, generated `COGENTA_AUTH_SIGNING_KEY` (and
  // any other real secret a site needs) into `.env` next to the config —
  // Node's own `--env-file` support, no new dependency (R9). Skipped
  // whenever the resolved env is not really `process.env`: a test (or any
  // caller) that injects its own synthetic map wants exactly that map, not
  // one silently topped up from a file on disk. Checking identity rather
  // than `options.env === undefined` matters because real callers up the
  // stack (the CLI's own `run()`, `runServe`) resolve `options.env ??
  // process.env` once and thread the *same object* down explicitly — so by
  // the time it reaches here, `options.env` is always "defined" even for a
  // real, unconfigured shell.
  if (env === process.env) {
    const configDir = path === null ? (options.cwd ?? process.cwd()) : dirname(path)
    const envFile = join(configDir, '.env')
    if (await exists(envFile)) {
      try {
        process.loadEnvFile(envFile)
      } catch {
        // Malformed .env is not fatal here — a real missing signingKey still
        // surfaces its own clear CONFIG_INVALID error downstream. This is a
        // best-effort convenience, not a second validation layer.
      }
    }
  }

  if (path === null) return { config: resolveConfig({}, env), path: null }

  let module: { default?: unknown }
  try {
    module = (await import(pathToFileURL(path).href)) as { default?: unknown }
  } catch (error) {
    throw new CogentaError({
      code: 'CONFIG_LOAD_FAILED',
      message: `Could not load ${path}: ${error instanceof Error ? error.message : String(error)}`,
      hint: path.endsWith('.ts')
        ? 'A TypeScript config needs a Node runtime that strips types, which means Node 22.18 or later. Rename it to cogenta.config.mjs if you are on an older one.'
        : 'Check the file for a syntax error, and that every import it uses is installed.',
      cause: error,
      details: { path },
    })
  }

  if (module.default === undefined) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `${path} has no default export.`,
      hint: 'Export the configuration as the default: `export default defineConfig({ … })`.',
      details: { path },
    })
  }

  // Relative paths in the file are relative to the file, not to the shell's
  // working directory: running a command from a subdirectory must reach the same
  // database, cache and media as running it from the project root.
  return { config: resolveConfig(module.default, env, dirname(path)), path }
}
