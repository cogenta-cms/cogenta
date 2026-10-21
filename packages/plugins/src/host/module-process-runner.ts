import { fork } from 'node:child_process'
import { readdir, realpath } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Importing a real ES module — a theme sandbox's files, written by an agent
 * or unpacked from a ZIP — in a **child process under Node's permission
 * model** (security review of 2026-10-21).
 *
 * Until then the sandbox validated a write with an `import()` in the
 * `cogenta serve` process itself, and previewed it in a worker thread of
 * that same process: a top-level `execSync(...)` in `theme.config.mjs` ran
 * with the server's environment, its signing key and its database. Here the
 * module can read the sandbox it lives in and the installed packages it
 * imports — never the project's `.env`, never `.cogenta/site.db` — cannot
 * spawn a process, and sees an empty environment.
 */

const GUEST_ENTRY = fileURLToPath(new URL('../guest/module-process-entry.mjs', import.meta.url))
const GUEST_DIR = dirname(GUEST_ENTRY)

/** How long the child may take to come up; its own clock starts after that. */
const STARTUP_TIMEOUT_MS = 30_000

export type ModuleProcessRequest =
  | {
      readonly type: 'run-module'
      readonly moduleUrl: string
      readonly exportName: string
      readonly args: readonly unknown[]
      readonly callbackNames: readonly string[]
    }
  | { readonly type: 'inspect-module'; readonly moduleUrl: string }

export interface ModuleProcessOptions {
  /**
   * What the module may read, each passed verbatim to `--allow-fs-read`
   * (a directory as `<dir>/*`, a single file as its path).
   */
  readonly readPaths: readonly string[]
  readonly callbacks: Readonly<Record<string, (args: readonly unknown[]) => unknown>>
  readonly timeoutMs: number
  readonly maxOldGenerationSizeMb: number
}

export interface ModuleProcessResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: string
  readonly reason?: 'timeout' | 'memory' | 'crash'
}

export function moduleGuestExecArgv(
  readPaths: readonly string[],
  maxOldGenerationSizeMb: number,
): string[] {
  return [
    '--permission',
    `--allow-fs-read=${GUEST_DIR}${sep}*`,
    ...readPaths.map((path) => `--allow-fs-read=${path}`),
    `--max-old-space-size=${maxOldGenerationSizeMb}`,
  ]
}

export function runModuleInPermissionedProcess(
  request: ModuleProcessRequest,
  options: ModuleProcessOptions,
): Promise<ModuleProcessResult> {
  return new Promise((resolve) => {
    const child = fork(GUEST_ENTRY, [], {
      execArgv: moduleGuestExecArgv(options.readPaths, options.maxOldGenerationSizeMb),
      env: {},
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'json',
    })

    let settled = false
    let stderr = ''
    const finish = (result: ModuleProcessResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      resolve(result)
    }

    let timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: `module process did not start within ${STARTUP_TIMEOUT_MS}ms`,
          reason: 'crash',
        }),
      STARTUP_TIMEOUT_MS,
    )

    child.stderr?.on('data', (chunk: Buffer) => {
      // Bounded: a module printing in a loop must not grow the host's memory.
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8')
    })

    child.on('message', (message: Record<string, unknown>) => {
      if (message.type === 'result') {
        finish({ ok: true, value: message.value })
        return
      }
      if (message.type === 'error') {
        finish({ ok: false, error: String(message.message) })
        return
      }
      if (message.type === 'guest-ready') {
        clearTimeout(timer)
        timer = setTimeout(
          () => finish({ ok: false, error: 'module process timed out', reason: 'timeout' }),
          options.timeoutMs,
        )
        child.send({ id: 1, ...request })
        return
      }
      if (message.type === 'callback-call') {
        const callId = message.callId
        const reply = (payload: Record<string, unknown>): void => {
          if (!settled) child.send({ callId, ...payload })
        }
        const handler = options.callbacks[String(message.name)]
        if (handler === undefined) {
          reply({ type: 'callback-error', message: `no host callback "${String(message.name)}"` })
          return
        }
        const args = Array.isArray(message.args) ? (message.args as unknown[]) : []
        void Promise.resolve()
          .then(() => handler(args))
          .then(
            (value) => reply({ type: 'callback-result', value }),
            (error: unknown) =>
              reply({
                type: 'callback-error',
                message: error instanceof Error ? error.message : String(error),
              }),
          )
      }
    })

    child.on('error', (error) => finish({ ok: false, error: String(error), reason: 'crash' }))

    child.on('exit', (exitCode, signal) => {
      if (settled) return
      const outOfMemory = stderr.includes('heap out of memory')
      // The first line of what the child printed says why it died (an import
      // it could not resolve, a syntax error): worth more than an exit code.
      const firstLine = stderr
        .split('\n')
        .find((line) => /Error|error:/u.test(line))
        ?.trim()
      finish({
        ok: false,
        error: firstLine ?? `module process exited with ${signal ?? exitCode}`,
        reason: outOfMemory ? 'memory' : 'crash',
      })
    })
  })
}

/**
 * What a module living in `moduleDir` must be allowed to read to import
 * its packages, in `--allow-fs-read` form: the directory itself, every
 * `node_modules` Node's resolution would walk up through and wherever their
 * symlinks really lead (a pnpm store, a workspace package), and the
 * `package.json` files on the way up (Node reads them to tell an ES module
 * from a CommonJS one). Only package code and manifests: a project's own
 * `.env` or `.cogenta/` is never on the list.
 */
export async function moduleReadPaths(moduleDir: string): Promise<readonly string[]> {
  const ancestors: string[] = []
  for (let dir = moduleDir; ; dir = dirname(dir)) {
    ancestors.push(dir)
    if (dirname(dir) === dir) break
  }
  const roots = await packageReadRoots(ancestors)
  return [
    `${moduleDir}${sep}*`,
    ...roots.map((root) => `${root}${sep}*`),
    ...ancestors.map((dir) => join(dir, 'package.json')),
  ]
}

async function packageReadRoots(ancestors: readonly string[]): Promise<readonly string[]> {
  const roots: string[] = []
  const covered = (path: string): boolean =>
    roots.some((root) => path === root || path.startsWith(`${root}${sep}`))

  const nodeModulesRootOf = (path: string): string | undefined => {
    const marker = `${sep}node_modules${sep}`
    const at = path.indexOf(marker)
    return at === -1 ? undefined : path.slice(0, at + marker.length - 1)
  }

  const visit = async (nodeModules: string, depth: number): Promise<void> => {
    if (depth > 6) return
    let real: string
    try {
      real = await realpath(nodeModules)
    } catch {
      return
    }
    if (covered(real)) return
    roots.push(real)

    const targets: string[] = []
    for (const entry of await readdir(real, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith('.')) continue
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(join(real, entry.name)).catch(() => [])) {
          targets.push(join(real, entry.name, scoped))
        }
      } else {
        targets.push(join(real, entry.name))
      }
    }

    for (const target of targets) {
      let resolved: string
      try {
        resolved = await realpath(target)
      } catch {
        continue
      }
      if (covered(resolved)) continue
      const store = nodeModulesRootOf(resolved)
      if (store !== undefined) {
        await visit(store, depth + 1)
      } else {
        // A workspace package linked from outside any node_modules: its own
        // files, then its own dependencies.
        roots.push(resolved)
        await visit(join(resolved, 'node_modules'), depth + 1)
      }
    }
  }

  for (const dir of ancestors) await visit(join(dir, 'node_modules'), 0)
  return roots
}
