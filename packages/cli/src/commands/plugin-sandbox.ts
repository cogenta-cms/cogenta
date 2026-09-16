import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { CogentaError } from '@cogenta/core'
import {
  IMPLEMENTED_CAPABILITY_NAMES,
  isCapabilityImplemented,
  loadPlugin,
  type ResolvedPlugin,
  readPluginCode,
  runIsolated,
} from '@cogenta/plugins'

/**
 * A place for a plugin to be written before a site ever runs it (L31 step 4).
 *
 * The same shape the theme workshop already proved (fiche 73): work happens
 * in `<projectRoot>/.cogenta/plugin-sandbox/<id>/`, never in `plugins/`, and
 * getting from one to the other is a deliberate, human-confirmed deploy. An
 * agent writing code is exactly the caller that makes this necessary — not
 * because a model is untrustworthy in particular, but because *nothing* that
 * writes code should be able to put it on a live site by itself (R6).
 *
 * Three guards, all structural rather than advisory:
 *
 * - a path that resolves outside the sandbox is refused (`..`, an absolute
 *   path, a symlink pointing out — checked on the real filesystem, not only
 *   lexically);
 * - `check` refuses a plugin whose manifest does not validate, whose code
 *   does not read, whose capabilities nothing implements, or that does not
 *   even evaluate inside the isolated worker;
 * - `deploy` never overwrites an installed plugin silently: it keeps a copy
 *   of what was there first.
 */

export const PLUGIN_SANDBOX_ROOT = join('.cogenta', 'plugin-sandbox')
export const PLUGIN_VERSIONS_ROOT = join('.cogenta', 'plugin-versions')
const SANDBOX_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u

export function pluginSandboxDirectory(projectRoot: string, id: string): string {
  if (!SANDBOX_ID.test(id)) {
    throw new CogentaError({
      code: 'PLUGIN_SANDBOX_PATH_ESCAPE',
      message: `"${id}" is not a usable sandbox id.`,
      hint: 'Use lower-case letters, digits and dashes — the id becomes a directory name.',
      details: { id },
    })
  }
  return join(projectRoot, PLUGIN_SANDBOX_ROOT, id)
}

function pathEscapeError(sandboxDir: string, relativePath: string): CogentaError {
  return new CogentaError({
    code: 'PLUGIN_SANDBOX_PATH_ESCAPE',
    message: `"${relativePath}" resolves outside the sandbox directory.`,
    hint: 'A sandbox path is always relative to the sandbox root — it can never use ".." to leave it.',
    details: { sandboxDir, relativePath },
  })
}

function resolveWithin(sandboxDir: string, relativePath: string): string {
  const root = resolve(sandboxDir)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + sep))
    throw pathEscapeError(sandboxDir, relativePath)
  return target
}

/** Lexical resolution is not enough: a symlink inside the sandbox can point anywhere. */
async function assertNoSymlinkEscape(sandboxDir: string, target: string): Promise<void> {
  const root = resolve(sandboxDir)
  const segments = target === root ? [] : target.slice(root.length + 1).split(sep)
  let current = root
  for (const segment of segments) {
    current = join(current, segment)
    const stats = await lstat(current).catch(() => null)
    if (stats === null) return
    if (stats.isSymbolicLink()) throw pathEscapeError(sandboxDir, target.slice(root.length + 1))
  }
}

async function resolveRealPath(sandboxDir: string, relativePath: string): Promise<string> {
  const target = resolveWithin(sandboxDir, relativePath)
  await assertNoSymlinkEscape(sandboxDir, target)
  return target
}

const STARTER_MANIFEST = (name: string): string => `export default {
  name: ${JSON.stringify(name)},
  version: '1.0.0',
  engine: '^1.0.0',
  // Ask for the narrowest capabilities that do the job: every one of these is
  // something a person has to say yes to before the plugin can use it.
  capabilities: [],
  provides: {},
  runtime: 'server',
  isolated: true,
  main: 'plugin.js',
}
`

const STARTER_CODE = `// The plugin's code. The script's completion value is the set of handlers it
// exposes; the site calls one of them by name. \`sdk\` is the only global, and
// it carries exactly the capabilities that were granted.
;({
  onContentEvent: async (event) => ({ seen: event.event }),
})
`

/** Creates an empty sandbox, holding a manifest and a handler that already validates. */
export async function createPluginSandbox(
  projectRoot: string,
  id: string,
  options: { readonly name?: string } = {},
): Promise<string> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  await mkdir(dir, { recursive: true })
  const name = options.name ?? id
  await writeFile(join(dir, 'plugin.manifest.mjs'), STARTER_MANIFEST(name), 'utf8')
  await writeFile(join(dir, 'plugin.js'), STARTER_CODE, 'utf8')
  return dir
}

export async function listPluginSandboxes(projectRoot: string): Promise<readonly string[]> {
  const entries = await readdir(join(projectRoot, PLUGIN_SANDBOX_ROOT), {
    withFileTypes: true,
  }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export async function listPluginSandboxFiles(
  projectRoot: string,
  id: string,
): Promise<readonly string[]> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  async function walk(current: string, prefix: string): Promise<string[]> {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) found.push(...(await walk(join(current, entry.name), relative)))
      else found.push(relative)
    }
    return found
  }
  return (await walk(dir, '')).sort()
}

export async function writePluginSandboxFile(
  projectRoot: string,
  id: string,
  relativePath: string,
  content: string,
): Promise<{ readonly path: string }> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  const target = await resolveRealPath(dir, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  return { path: relativePath }
}

export async function readPluginSandboxFile(
  projectRoot: string,
  id: string,
  relativePath: string,
): Promise<string> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  const target = await resolveRealPath(dir, relativePath)
  return readFile(target, 'utf8').catch(() => {
    throw new CogentaError({
      code: 'PLUGIN_SANDBOX_INVALID',
      message: `The sandbox "${id}" has no file at "${relativePath}".`,
      hint: 'List the sandbox’s files first.',
      details: { id, relativePath },
    })
  })
}

export async function deletePluginSandbox(projectRoot: string, id: string): Promise<void> {
  await rm(pluginSandboxDirectory(projectRoot, id), { recursive: true, force: true })
}

export interface PluginSandboxCheck {
  readonly ok: boolean
  /** Everything wrong with it, in the order a person would fix them. */
  readonly problems: readonly string[]
  readonly manifest: ResolvedPlugin['manifest'] | null
  /** The handlers its code actually exposes — what the site would be able to call. */
  readonly handlers: readonly string[]
  /** Capabilities it requests that no host implements: grantable never, useful never. */
  readonly unimplemented: readonly string[]
}

/**
 * Everything that can be known about a sandboxed plugin without installing
 * it: does its manifest validate, does its code read, does it evaluate inside
 * the real isolated worker, and what does it expose. Running it with no
 * capability granted is deliberate — the answer tells a reviewer what the
 * plugin is, and nothing it does here can touch the site.
 */
export async function checkPluginSandbox(
  projectRoot: string,
  id: string,
): Promise<PluginSandboxCheck> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  const problems: string[] = []

  let resolved: ResolvedPlugin
  try {
    resolved = await loadPlugin(dir)
  } catch (error) {
    return {
      ok: false,
      problems: [error instanceof Error ? error.message : String(error)],
      manifest: null,
      handlers: [],
      unimplemented: [],
    }
  }

  let code: string | null = null
  try {
    code = await readPluginCode(resolved.packageRoot, resolved.manifest)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }

  const unimplemented = resolved.manifest.capabilities.filter(
    (capability) => !isCapabilityImplemented(capability),
  )
  if (unimplemented.length > 0) {
    problems.push(
      `Capabilities nothing implements yet: ${unimplemented.join(', ')}. Implemented today: ${IMPLEMENTED_CAPABILITY_NAMES.join(', ')}.`,
    )
  }

  let handlers: readonly string[] = []
  if (code !== null) {
    // Evaluated with nothing granted, in the real worker: a plugin whose code
    // throws on load, or whose completion value is not a set of handlers,
    // would fail the same way on a site — better to find out here.
    const run = await runIsolated(code, { timeoutMs: 5000, describeHandlers: true })
    if (!run.ok) {
      problems.push(`Its code does not evaluate: ${run.error ?? 'unknown error'}.`)
    } else if (!Array.isArray(run.value)) {
      problems.push('Its code does not return a set of handlers, so the site could call nothing.')
    } else {
      handlers = run.value as readonly string[]
      const provides = resolved.manifest.provides
      if ((provides.eventSubscriptions ?? []).length > 0 && !handlers.includes('onContentEvent')) {
        problems.push('It subscribes to events but exposes no "onContentEvent" handler.')
      }
      if ((provides.routes ?? []).length > 0 && !handlers.includes('onRequest')) {
        problems.push('It declares routes but exposes no "onRequest" handler.')
      }
      if ((provides.schedules ?? []).length > 0 && !handlers.includes('onSchedule')) {
        problems.push('It declares schedules but exposes no "onSchedule" handler.')
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    manifest: resolved.manifest,
    handlers,
    unimplemented,
  }
}

export interface PluginDeployment {
  readonly ok: boolean
  readonly problems: readonly string[]
  /** Where it landed, once it did. */
  readonly installedAt?: string
  /** A copy of whatever it replaced, so a bad deploy is undoable. */
  readonly backupAt?: string
  /** What the installed plugin asks for — the list a person grants from, or does not. */
  readonly capabilities?: readonly string[]
}

/**
 * Installs a sandboxed plugin into `plugins/<name>/`.
 *
 * Refuses a sandbox that does not pass `checkPluginSandbox`: a site should
 * never hold a plugin nobody could run. Overwriting an installed plugin is an
 * explicit choice, and even then the previous copy is kept under
 * `.cogenta/plugin-versions/`, because "the agent rewrote my plugin" must not
 * be the end of the story.
 *
 * Installing grants nothing. A freshly deployed plugin holds no capability at
 * all until someone grants one, so the worst a surprise deploy can do is
 * nothing.
 */
export async function deployPluginFromSandbox(
  projectRoot: string,
  id: string,
  options: { readonly pluginsDir?: string; readonly overwrite?: boolean } = {},
): Promise<PluginDeployment> {
  const check = await checkPluginSandbox(projectRoot, id)
  if (!check.ok || check.manifest === null) {
    return { ok: false, problems: check.problems }
  }

  const name = check.manifest.name
  const destination = join(projectRoot, options.pluginsDir ?? 'plugins', name.replace('/', '__'))
  const exists = await lstat(destination).then(
    () => true,
    () => false,
  )
  if (exists && options.overwrite !== true) {
    return {
      ok: false,
      problems: [
        `A plugin is already installed at ${destination}. Deploy again with overwrite to replace it; the copy it replaces is kept.`,
      ],
    }
  }

  let backupAt: string | undefined
  if (exists) {
    backupAt = join(
      projectRoot,
      PLUGIN_VERSIONS_ROOT,
      name.replace('/', '__'),
      new Date().toISOString().replaceAll(':', '-'),
    )
    await mkdir(dirname(backupAt), { recursive: true })
    await cp(destination, backupAt, { recursive: true })
    await rm(destination, { recursive: true, force: true })
  }

  await mkdir(dirname(destination), { recursive: true })
  await cp(pluginSandboxDirectory(projectRoot, id), destination, { recursive: true })

  return {
    ok: true,
    problems: [],
    installedAt: destination,
    ...(backupAt === undefined ? {} : { backupAt }),
    capabilities: check.manifest.capabilities,
  }
}

/**
 * What `plugin.write_sandbox_file`, `plugin.read_sandbox_file` and
 * `plugin.check_sandbox` are handed (L31 step 4): this package holds the
 * filesystem and its guards, `@cogenta/agents-builtin` holds the tool
 * definitions, and the dependency arrow runs that way — exactly the shape the
 * theme workshop already uses (`createThemeSandboxToolWiring`).
 */
export function createPluginSandboxToolWiring(projectRoot: string): {
  readonly writeFile: (input: {
    readonly sandboxId: string
    readonly path: string
    readonly content: string
  }) => Promise<{ readonly path: string }>
  readonly deleteFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<void>
  readonly readFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<{ readonly content: string }>
  readonly listFiles: (input: { readonly sandboxId: string }) => Promise<readonly string[]>
  readonly check: (input: { readonly sandboxId: string }) => Promise<{
    readonly ok: boolean
    readonly problems: readonly string[]
    readonly handlers: readonly string[]
    readonly capabilities: readonly string[]
  }>
} {
  return {
    writeFile: async (input) => {
      // A sandbox an agent names may not exist yet: creating it on first
      // write is the difference between "start by asking a human to run a
      // command" and "get on with it".
      await mkdir(pluginSandboxDirectory(projectRoot, input.sandboxId), { recursive: true })
      return writePluginSandboxFile(projectRoot, input.sandboxId, input.path, input.content)
    },
    deleteFile: async (input) => {
      const dir = pluginSandboxDirectory(projectRoot, input.sandboxId)
      await rm(await resolveRealPath(dir, input.path), { force: true })
    },
    readFile: async (input) => ({
      content: await readPluginSandboxFile(projectRoot, input.sandboxId, input.path),
    }),
    listFiles: (input) => listPluginSandboxFiles(projectRoot, input.sandboxId),
    check: async (input) => {
      const result = await checkPluginSandbox(projectRoot, input.sandboxId)
      return {
        ok: result.ok,
        problems: result.problems,
        handlers: result.handlers,
        capabilities: result.manifest?.capabilities ?? [],
      }
    },
  }
}
