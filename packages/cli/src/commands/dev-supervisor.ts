import { type Stats, unwatchFile, watchFile } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { findConfigFile } from '@cogenta/core'
import { runServe, SCHEMA_FILE_CANDIDATES, type ServeOptions } from './serve.js'

/** How often the schema files are stat'ed. Polling, not `fs.watch`: it behaves the same on every OS and filesystem. */
const SCHEMA_POLL_MS = 400
/** A save that rewrites a file in several writes is one change, not several restarts. */
const RESTART_DEBOUNCE_MS = 250

export interface DevOptions extends Omit<ServeOptions, 'development'> {
  /** Overrides `SCHEMA_POLL_MS`, so a test does not wait on the production cadence. */
  readonly schemaPollMs?: number
  /** Called before each restart the supervisor starts on its own. */
  readonly onRestart?: (reason: { file: string }) => void
}

/**
 * `cogenta dev`: `cogenta serve` with a writable schema (ADR-0010), restarted
 * in-process whenever `cogenta.schema.*` changes (L28 D7).
 *
 * Collections are read once at start-up, so a schema written by the site plan
 * applier or the sample-data import used to need a manual restart the admin
 * could only ask for. In development the supervisor does it: the running
 * server is stopped through its own shutdown path (connections, database,
 * queues), then started again on the same port, so the admin reconnects to the
 * address it already has. A schema that no longer loads leaves the server down
 * and the supervisor waiting for the next save, never exiting on a typo.
 * `cogenta serve` has no supervisor: production never restarts implicitly.
 */
export async function runDev(options: DevOptions): Promise<number> {
  const { schemaPollMs, onRestart, ...serveOptions } = options
  const cwd = options.cwd ?? process.cwd()
  const configPath = await findConfigFile(cwd)
  const projectRoot = configPath === null ? cwd : dirname(configPath)
  const files = SCHEMA_FILE_CANDIDATES.map((name) => join(projectRoot, name))

  let port = options.port
  let current: AbortController | undefined
  let pendingChange: string | undefined
  let debounce: NodeJS.Timeout | undefined
  let wake: (() => void) | undefined

  const onChange = (file: string) => (now: Stats, previous: Stats) => {
    if (now.mtimeMs === previous.mtimeMs && now.size === previous.size) return
    pendingChange = file
    if (debounce !== undefined) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      current?.abort()
      wake?.()
    }, RESTART_DEBOUNCE_MS)
  }
  const listeners = files.map((file) => {
    const listener = onChange(file)
    watchFile(file, { interval: schemaPollMs ?? SCHEMA_POLL_MS, persistent: false }, listener)
    return { file, listener }
  })

  const stopped = (): boolean => options.signal?.aborted === true
  const onStop = (): void => {
    current?.abort()
    wake?.()
  }
  options.signal?.addEventListener('abort', onStop, { once: true })

  let exitCode = 0
  try {
    while (!stopped()) {
      current = new AbortController()
      const started = runServe({
        ...serveOptions,
        development: true,
        signal: current.signal,
        ...(port === undefined ? {} : { port }),
        onListening: (address) => {
          // Port 0 asks the OS for one; every restart after the first must
          // reuse what it got, or the admin loses the server it is talking to.
          port = address.port
          options.onListening?.(address)
        },
      })
      exitCode = await started.catch((error: unknown) => {
        options.stderr(
          `The development server stopped: ${error instanceof Error ? error.message : String(error)}\n`,
        )
        return 1
      })
      if (stopped()) break

      if (pendingChange === undefined) {
        // The server ended without a schema change (a startup failure, most
        // often an invalid schema): wait for the next save instead of exiting.
        options.out.detail('Waiting for cogenta.schema.* to change before starting again.')
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        wake = undefined
        if (stopped()) break
      }
      const file = pendingChange ?? files[0] ?? projectRoot
      pendingChange = undefined
      options.out.ok(`${file} changed — restarting the development server.`)
      onRestart?.({ file })
    }
  } finally {
    options.signal?.removeEventListener('abort', onStop)
    if (debounce !== undefined) clearTimeout(debounce)
    for (const { file, listener } of listeners) unwatchFile(file, listener)
  }
  return exitCode
}
