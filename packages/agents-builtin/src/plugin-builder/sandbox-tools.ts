import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'

/**
 * The three tools "Cogenta Plugin Builder" has (L31 step 4), mirroring the
 * theme workshop's (fiche 73 task 7) down to the same guarantees:
 *
 * - they write into `<projectRoot>/.cogenta/plugin-sandbox/<id>/` and nowhere
 *   else — never `plugins/`, so nothing an agent writes is ever something a
 *   running site would load;
 * - the write is `sideEffects: true` + `reversible: true` with a real
 *   `revert` (it deletes the file it wrote), so `withAutonomy` governs it
 *   like any other write rather than the tool policing itself (R4);
 * - the filesystem guards live host-side, in `@cogenta/cli`'s
 *   `plugin-sandbox.ts`: this package has no filesystem of its own to guard,
 *   and a path that leaves the sandbox is refused there, on the real disk.
 *
 * Installing what the sandbox holds is deliberately **not** a tool. It is a
 * human action, from the admin or the CLI, after reading what the plugin
 * asks for.
 */

export interface PluginSandboxToolOptions {
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
}

const WriteInput = z.object({
  sandboxId: z.string().min(1),
  /** Sandbox-relative: `plugin.manifest.mjs`, `plugin.js`, `lib/feed.js`. Never absolute, never `../`. */
  path: z.string().min(1),
  content: z.string(),
})
export type WritePluginSandboxFileInput = z.infer<typeof WriteInput>

const WriteOutput = z.object({ sandboxId: z.string(), path: z.string() })
export type WritePluginSandboxFileOutput = z.infer<typeof WriteOutput>

const WRITE_DESCRIPTION = `Writes one real source file into a plugin sandbox — actual JavaScript, not a description of it. A plugin is how this CMS gains a feature it does not have: it reacts to content events, serves its own page, or runs on a cadence, inside an isolated worker with only the capabilities a human granted it.

Two files matter. \`plugin.manifest.mjs\` exports default an object with EXACTLY these fields: name (a package-like name, e.g. 'newsletter-digest'), version ('1.0.0', exact semver), engine ('^1.0.0', a semver RANGE), capabilities (string[], see below), provides (object, see below), runtime: 'server', isolated: true, and optionally main (the code file, 'plugin.js' by default).

\`plugin.js\` is a classic script — no import, no require, no top-level await. Its completion value is the set of handlers the site can call, written as an expression statement:

;({
  onContentEvent: async (event) => { /* event.event, event.collection, event.id */ },
  onRequest: async (request) => ({ status: 200, contentType: 'text/html', body: '<p>hi</p>' }),
  onSchedule: async ({ name }) => 'what it did',
})

Which handlers to write follows from \`provides\`: eventSubscriptions: ['content.publish'|'content.unpublish'|'content.delete'] needs onContentEvent; routes: ['/hello'] needs onRequest (served at /_cogenta/plugins/<name>/hello, and the answer may set a status, a contentType among text/plain, text/html, application/json, application/xml, text/csv, and a body — never a header); schedules: [{ name: 'digest', everyMinutes: 1440 }] needs onSchedule (five minutes minimum).

Capabilities a host implements today, and nothing else: content.read, content.write_draft, content.publish, content.delete, media.read, schema.read, http.fetch:<hostname>, storage.read:plugins/<plugin name>, storage.write:plugins/<plugin name>. The four content ones may name a collection (content.write_draft:article). Ask for the fewest that do the job — each one is something a person must agree to, and a plugin that asks for more than it uses is harder to say yes to. Anything not on that list (channel.send, agent.delegate, memory.*, deps.*, build.trigger, deploy.trigger, site.config_*, media.write) cannot be granted and would leave the method absent from \`sdk\`.

Inside a handler, \`sdk\` is the only global that matters: sdk.content.read({id}), sdk.content.write_draft({collection, values}), sdk.schema.read({}), sdk.http.fetch({url}), sdk.storage.read({key})/write({key, content}). A capability that was not granted is ABSENT from sdk — not a refusing stub — so guard with \`if (!sdk.storage) …\` when it is optional.

Write the manifest first, then the code, then call plugin.check_sandbox and fix what it names. Never write into plugins/: deploying the sandbox is a separate action a human takes after reading what the plugin asks for.`

export function createWritePluginSandboxFileTool(
  options: PluginSandboxToolOptions,
): ToolDefinition<WritePluginSandboxFileInput, WritePluginSandboxFileOutput> {
  return defineTool({
    name: 'plugin.write_sandbox_file',
    version: '1.0.0',
    description: WRITE_DESCRIPTION,
    input: WriteInput,
    output: WriteOutput,
    permissions: ['plugin.write_sandbox'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    async execute(input) {
      const written = await options.writeFile(input)
      return { sandboxId: input.sandboxId, path: written.path }
    },
    async revert(receipt) {
      await options.deleteFile({ sandboxId: receipt.sandboxId, path: receipt.path })
    },
  })
}

const ReadInput = z.object({
  sandboxId: z.string().min(1),
  /** Omitted: the sandbox's file list, which is where to start on a sandbox someone else began. */
  path: z.string().min(1).optional(),
})
export type ReadPluginSandboxInput = z.infer<typeof ReadInput>

const ReadOutput = z.object({
  sandboxId: z.string(),
  files: z.array(z.string()).optional(),
  path: z.string().optional(),
  content: z.string().optional(),
})
export type ReadPluginSandboxOutput = z.infer<typeof ReadOutput>

export function createReadPluginSandboxTool(
  options: PluginSandboxToolOptions,
): ToolDefinition<ReadPluginSandboxInput, ReadPluginSandboxOutput> {
  return defineTool({
    name: 'plugin.read_sandbox_file',
    version: '1.0.0',
    description:
      'Reads what a plugin sandbox already holds: its file list with no path, or one file’s content with one. Read before rewriting — a sandbox may already hold work, yours or a person’s.',
    input: ReadInput,
    output: ReadOutput,
    permissions: ['plugin.write_sandbox'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      if (input.path === undefined) {
        return { sandboxId: input.sandboxId, files: [...(await options.listFiles(input))] }
      }
      const file = await options.readFile({ sandboxId: input.sandboxId, path: input.path })
      return { sandboxId: input.sandboxId, path: input.path, content: file.content }
    },
  })
}

const CheckInput = z.object({ sandboxId: z.string().min(1) })
export type CheckPluginSandboxInput = z.infer<typeof CheckInput>

const CheckOutput = z.object({
  ok: z.boolean(),
  problems: z.array(z.string()),
  handlers: z.array(z.string()),
  capabilities: z.array(z.string()),
})
export type CheckPluginSandboxOutput = z.infer<typeof CheckOutput>

export function createCheckPluginSandboxTool(
  options: PluginSandboxToolOptions,
): ToolDefinition<CheckPluginSandboxInput, CheckPluginSandboxOutput> {
  return defineTool({
    name: 'plugin.check_sandbox',
    version: '1.0.0',
    description:
      'Checks a plugin sandbox the way the site would before installing it: the manifest must validate, the code must evaluate inside the real isolated worker with nothing granted, every declared event, route and schedule must have its handler, and every capability must be one a host implements. Returns the problems by name — fix them and check again. It runs the code with no capability at all, so it can touch nothing.',
    input: CheckInput,
    output: CheckOutput,
    permissions: ['plugin.write_sandbox'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const result = await options.check(input)
      return {
        ok: result.ok,
        problems: [...result.problems],
        handlers: [...result.handlers],
        capabilities: [...result.capabilities],
      }
    },
  })
}
