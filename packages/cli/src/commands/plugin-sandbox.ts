import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { CogentaError } from '@cogenta/core'
import {
  IMPLEMENTED_CAPABILITY_NAMES,
  isCapabilityImplemented,
  loadPlugin,
  type PluginManifest,
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

/**
 * What a person picks from when they create a plugin, instead of being handed
 * an empty file and a manifest format to learn.
 *
 * Each one is a plugin that already works: it validates, it evaluates in the
 * real sandbox, and installing it does something observable. The capabilities
 * it asks for are the narrowest that do its job — and they are still only
 * requests, granted one at a time by a person afterwards.
 */
export interface PluginTemplate {
  readonly id: string
  /** What the plugin will do, in the words of someone who has not read the manifest format. */
  readonly capabilities: readonly string[]
  readonly provides: PluginManifest['provides']
  readonly code: string
}

const TEMPLATE_CODE = {
  blank: `// The plugin's code. The value at the end of this file is the set of
// handlers it exposes; the site calls one of them by name. \`sdk\` is the only
// global, and it carries exactly the capabilities that were granted — an
// ungranted one is not refused, it is simply absent.
;({
  onContentEvent: async (event) => ({ seen: event.event }),
})
`,
  'on-publish': `// Runs every time an entry is published or unpublished.
// \`event.event\` is the name, \`event.collection\` and \`event.id\` say what moved.
;({
  onContentEvent: async (event) => {
    if (event.event !== 'content.publish') return { skipped: event.event }

    // Granted "content.read"? Then the entry itself is readable.
    const entry = await sdk.content.read({ collection: event.collection, id: event.id })
    console.log('published: ' + (entry?.values?.title ?? event.id))

    return { handled: event.id }
  },
})
`,
  page: `// Serves a page of its own, at /_cogenta/plugins/<plugin name>/hello.
// Answer with a status, a content type and a body — nothing else: a plugin
// never sets a header on the site's own origin.
;({
  onRequest: async (request) => ({
    status: 200,
    contentType: 'text/html',
    body: '<h1>Hello from a plugin</h1><p>You asked for ' + request.path + '.</p>',
  }),
})
`,
  daily: `// Runs on its own cadence — every 24 hours, as the manifest says.
// Return a short sentence: it is what the Operations screen shows as the
// result of the run.
;({
  onSchedule: async (task) => 'ran ' + task.name,
})
`,
} as const

export const PLUGIN_TEMPLATES: readonly PluginTemplate[] = [
  { id: 'blank', capabilities: [], provides: {}, code: TEMPLATE_CODE.blank },
  {
    id: 'on-publish',
    capabilities: ['content.read'],
    provides: { eventSubscriptions: ['content.publish', 'content.unpublish'] },
    code: TEMPLATE_CODE['on-publish'],
  },
  { id: 'page', capabilities: [], provides: { routes: ['/hello'] }, code: TEMPLATE_CODE.page },
  {
    id: 'daily',
    capabilities: [],
    provides: { schedules: [{ name: 'daily', everyMinutes: 24 * 60 }] },
    code: TEMPLATE_CODE.daily,
  },
]

export function pluginTemplate(id: string | undefined): PluginTemplate {
  return (
    PLUGIN_TEMPLATES.find((template) => template.id === id) ??
    (PLUGIN_TEMPLATES[0] as PluginTemplate)
  )
}

/**
 * A plugin's name is written by a person ("Lettre d'information"); its
 * directory is not. Deriving one from the other is what lets a creation form
 * ask a single question instead of two, one of which is a slug.
 */
export function pluginSandboxIdFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 64)
  return slug === '' ? 'plugin' : slug
}

const STARTER_MANIFEST = (
  name: string,
  title: string | undefined,
  template: PluginTemplate,
): string =>
  `${JSON.stringify(
    {
      name,
      // What a person calls it, when that is not what a package may be
      // called. Omitted when the two are the same, so a hand-written plugin
      // never grows a field it did not ask for.
      ...(title === undefined || title === name ? {} : { title }),
      version: '1.0.0',
      // Ask for the narrowest capabilities that do the job: every one is
      // something a person has to say yes to before the plugin can use it.
      capabilities: template.capabilities,
      engine: '^1.0.0',
      provides: template.provides,
      runtime: 'server',
      isolated: true,
      main: 'plugin.js',
    },
    null,
    2,
  )}\n`

/** Creates an empty sandbox, holding a manifest and a handler that already validates. */
export async function createPluginSandbox(
  projectRoot: string,
  id: string,
  options: {
    readonly name?: string
    /** The human name, when it is not a package name — "Lettre d'information". */
    readonly title?: string
    readonly template?: string
  } = {},
): Promise<string> {
  const dir = pluginSandboxDirectory(projectRoot, id)
  await mkdir(dir, { recursive: true })
  const name = options.name ?? id
  const template = pluginTemplate(options.template)
  await writeFile(
    join(dir, 'plugin.manifest.json'),
    STARTER_MANIFEST(name, options.title, template),
    'utf8',
  )
  await writeFile(join(dir, 'plugin.js'), template.code, 'utf8')
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

export interface PluginSandboxSummary {
  readonly id: string
  /** The plugin's own name, as its manifest states it — never the directory's. */
  readonly name: string
  /** What to call it in front of a person, when the manifest says. */
  readonly title: string | null
  readonly version: string
  readonly capabilities: readonly string[]
  readonly provides: PluginManifest['provides']
  /** `false` when the manifest does not even parse: enough to show, not enough to install. */
  readonly readable: boolean
}

/**
 * Every draft, described from its manifest alone.
 *
 * Deliberately not `checkPluginSandbox`: that one evaluates the plugin's code
 * in a real sandboxed process, which is the right thing to do before
 * installing and the wrong thing to do for every draft each time a screen
 * opens. Listing reads JSON; checking runs code, on purpose, when asked.
 */
export async function describePluginSandboxes(
  projectRoot: string,
): Promise<readonly PluginSandboxSummary[]> {
  const ids = await listPluginSandboxes(projectRoot)
  return await Promise.all(
    ids.map(async (id) => {
      const raw = await readFile(
        join(pluginSandboxDirectory(projectRoot, id), 'plugin.manifest.json'),
        'utf8',
      ).catch(() => null)
      let parsed: Partial<PluginManifest> | null = null
      if (raw !== null) {
        try {
          parsed = JSON.parse(raw) as Partial<PluginManifest>
        } catch {
          parsed = null
        }
      }
      return {
        id,
        name: typeof parsed?.name === 'string' ? parsed.name : id,
        title: typeof parsed?.title === 'string' ? parsed.title : null,
        version: typeof parsed?.version === 'string' ? parsed.version : '—',
        capabilities: Array.isArray(parsed?.capabilities) ? parsed.capabilities : [],
        provides: (parsed?.provides ?? {}) as PluginManifest['provides'],
        readable: parsed !== null,
      }
    }),
  )
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

export interface PluginUninstall {
  readonly ok: boolean
  readonly problems: readonly string[]
  /** Where the removed copy was kept — nothing here destroys a plugin's code. */
  readonly backupAt?: string
}

/**
 * Removes an installed plugin from `plugins/<name>/`.
 *
 * The copy is kept under `.cogenta/plugin-versions/`, for the same reason a
 * replaced plugin is: "I removed the wrong one" must not be the end of the
 * story. The grants are the caller's to revoke — they live in the database,
 * not on disk, and revoking them is an act the audit log should carry under
 * its own name.
 */
export async function uninstallPlugin(
  projectRoot: string,
  name: string,
  options: { readonly pluginsDir?: string } = {},
): Promise<PluginUninstall> {
  const directory = join(projectRoot, options.pluginsDir ?? 'plugins', name.replace('/', '__'))
  const exists = await lstat(directory).then(
    () => true,
    () => false,
  )
  if (!exists) {
    return { ok: false, problems: [`No plugin is installed at ${directory}.`] }
  }
  const backupAt = join(
    projectRoot,
    PLUGIN_VERSIONS_ROOT,
    name.replace('/', '__'),
    new Date().toISOString().replaceAll(':', '-'),
  )
  await mkdir(dirname(backupAt), { recursive: true })
  await cp(directory, backupAt, { recursive: true })
  await rm(directory, { recursive: true, force: true })
  return { ok: true, problems: [], backupAt }
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
