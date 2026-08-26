import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { CogentaError, type Logger } from '@cogenta/core'
import type { JsonRpcResponse } from '../jsonrpc.js'
import type {
  ChildProcessLike,
  McpCallOptions,
  McpClient,
  McpServerInfo,
  McpToolCallResult,
  McpToolSpec,
} from './types.js'
import { type PidWatchdog, type ReadPidUsage, startPidWatchdog } from './watchdog.js'

/**
 * The exact options `child_process.spawn` receives for one connection —
 * pulled out so `spawnFn` (real spawn in production, a fake in tests) sees
 * precisely what this client decided to hand the OS, nothing implicit.
 */
export interface SpawnOptionsForClient {
  readonly env: Readonly<Record<string, string>>
  readonly cwd: string
}

export interface McpStdioClientOptions {
  readonly command: string
  readonly args?: readonly string[]
  /**
   * The exact environment the spawned process receives. **Never**
   * `process.env`, and never merged with it — the previous default (no
   * `env` at all, which `child_process.spawn` resolves to "inherit the
   * host's environment") handed a third-party binary every secret this
   * process had, including `COGENTA_AUTH_SIGNING_KEY`, before the server
   * had even been asked to `initialize()`. Omit this option (or pass `{}`)
   * for a process that receives no environment variables at all; list
   * exactly what it needs otherwise.
   */
  readonly env?: Readonly<Record<string, string>>
  /**
   * A dedicated working directory for this one connection — see
   * `./sandbox.js`'s `createSandboxWorkDir`. Required, deliberately: there
   * is no safe implicit default (`process.cwd()` for `cogenta serve` is the
   * site's own project root).
   */
  readonly cwd: string
  /**
   * Where captured stderr is logged, structured, through this project's own
   * redaction-aware logger — never `stdio: [...,...,'inherit']`, which
   * would both bypass that logger's secret-redaction policy and let a
   * hostile server inject arbitrary bytes into the host's own log stream.
   * Defaults to a silent logger (still captured, just not emitted) so a
   * caller that has no logger handy yet does not need to build one.
   */
  readonly logger?: Logger
  /** Hard ceiling on one JSON-RPC round trip (`initialize`, `tools/list`, or `tools/call`) — exceeded, the child process is killed and every pending call (this one included) rejects. A server that never responds cannot block a run indefinitely. */
  readonly callTimeoutMs?: number
  /** Caps how many bytes of stderr are buffered/logged for this connection — a hostile or merely buggy server flooding stderr cannot exhaust host memory or log storage. */
  readonly maxStderrBytes?: number
  /** `undefined` disables the memory ceiling. Defaults to 512 MiB — generous for a tool server, small enough to catch a runaway process. */
  readonly maxRssBytes?: number
  /** `undefined` disables the CPU ceiling. Defaults to 200 (i.e. 200%, two full cores) — see `./watchdog.js`'s own module comment on why this is a floor, not a guarantee. */
  readonly maxCpuPercent?: number
  readonly watchdogPollMs?: number
  /** Injectable for tests — defaults to the real `ps`/PowerShell probe (`./watchdog.js`). */
  readonly readPidUsage?: ReadPidUsage
  /** Injectable for tests — defaults to `node:child_process.spawn`, always piping all three streams. */
  readonly spawnFn?: (
    command: string,
    args: readonly string[],
    spawnOptions: SpawnOptionsForClient,
  ) => ChildProcessLike
}

const DEFAULT_CALL_TIMEOUT_MS = 30_000
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024
const DEFAULT_MAX_RSS_BYTES = 512 * 1024 * 1024
const DEFAULT_MAX_CPU_PERCENT = 200

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: SpawnOptionsForClient,
): ChildProcessLike {
  // stdio is always fully piped — never `inherit` on stdout or stderr (fiche 58
  // task 1bis): `inherit` on stderr would both bypass the structured
  // logger's secret-redaction policy and let a hostile server write
  // arbitrary bytes straight into the host process's own log stream.
  const child = spawn(command, [...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: options.cwd,
    env: options.env,
  })
  return child as unknown as ChildProcessLike
}

function silentLogger(): Logger {
  const noop = (): void => undefined
  const logger: Logger = {
    level: 'silent',
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
    isLevelEnabled: () => false,
  }
  return logger
}

/**
 * The same JSON-RPC-per-line protocol `serveMcpOverStdio` (task 17) speaks,
 * from the other end: spawns a third-party MCP server as a child process and
 * talks to it over its stdio. "Le client MCP permet aux agents de consommer
 * des serveurs tiers" — this is that consumption; `wrapMcpTool` is what
 * turns what it discovers into something the runtime can actually grant to
 * an agent, with permissions declared exactly like an internal tool.
 *
 * Fiche 58 task 1bis's plancher de sandboxing lives here: no implicit
 * environment inheritance, no `inherit` stdio, a hard per-call timeout that
 * kills the process, and a best-effort memory/CPU watchdog. None of this
 * makes running an arbitrary third-party binary safe — it runs with the
 * full OS privileges of the Cogenta process, always (see the registry
 * layer's mandatory confirmation, `../registry/store.js`) — it only removes
 * the specific, structural leaks a naive `spawn()` would otherwise have.
 */
export function createMcpStdioClient(options: McpStdioClientOptions): McpClient {
  const spawnFn = options.spawnFn ?? defaultSpawn
  const env = options.env ?? {}
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES
  const maxRssBytes = options.maxRssBytes ?? DEFAULT_MAX_RSS_BYTES
  const maxCpuPercent = options.maxCpuPercent ?? DEFAULT_MAX_CPU_PERCENT
  const logger = options.logger ?? silentLogger()

  const child = spawnFn(options.command, options.args ?? [], { env, cwd: options.cwd })
  const rl = createInterface({ input: child.stdout })
  const pending = new Map<
    number,
    { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }
  >()
  let nextId = 1
  let closed = false
  let stderrBytesLogged = 0
  let stderrTruncated = false
  let watchdog: PidWatchdog | undefined

  function rejectAllPending(error: Error): void {
    for (const [, entry] of pending) entry.reject(error)
    pending.clear()
  }

  function killAndRejectAll(error: Error): void {
    try {
      child.kill()
    } catch {
      // already gone
    }
    rejectAllPending(error)
  }

  // stderr is always captured, never left to `inherit` — logged through the
  // structured logger (which owns secret redaction), capped so a flood
  // cannot exhaust memory or log storage.
  if (child.stderr !== undefined) {
    const stderrRl = createInterface({ input: child.stderr })
    stderrRl.on('line', (line) => {
      if (stderrBytesLogged >= maxStderrBytes) {
        if (!stderrTruncated) {
          stderrTruncated = true
          logger.warn('mcp client: remote stderr truncated (cap reached)', {
            command: options.command,
            maxStderrBytes,
          })
        }
        return
      }
      stderrBytesLogged += Buffer.byteLength(line, 'utf8')
      logger.warn('mcp client: remote stderr', { command: options.command, line })
    })
  }

  child.once?.('exit', () => {
    if (closed) return
    killAndRejectAll(
      new CogentaError({
        code: 'MCP_CLIENT_PROCESS_EXITED',
        message: 'The MCP server process exited before responding.',
        hint: "Check this connection's captured stderr for why it exited.",
      }),
    )
  })
  child.once?.('error', (error: unknown) => {
    killAndRejectAll(
      new CogentaError({
        code: 'MCP_CLIENT_SPAWN_FAILED',
        message: `Could not start the MCP server process: ${
          error instanceof Error ? error.message : String(error)
        }`,
        hint: 'Check the command and arguments configured for this connection.',
        cause: error,
      }),
    )
  })

  if (child.pid !== undefined && (maxRssBytes !== undefined || maxCpuPercent !== undefined)) {
    watchdog = startPidWatchdog({
      pid: child.pid,
      ...(options.watchdogPollMs === undefined ? {} : { pollMs: options.watchdogPollMs }),
      ...(maxRssBytes === undefined ? {} : { maxRssBytes }),
      ...(maxCpuPercent === undefined ? {} : { maxCpuPercent }),
      ...(options.readPidUsage === undefined ? {} : { readUsage: options.readPidUsage }),
      onExceeded: (usage, reason) => {
        logger.error('mcp client: resource ceiling exceeded, killing the process', {
          command: options.command,
          reason,
          rssBytes: usage.rssBytes,
          cpuPercent: usage.cpuPercent,
        })
        killAndRejectAll(
          new CogentaError({
            code: 'MCP_CLIENT_RESOURCE_EXCEEDED',
            message: `The MCP server process exceeded its ${reason} ceiling and was killed.`,
            hint: 'This is a best-effort floor (see docs/05-securite.md) — a repeatedly misbehaving server should be disabled from the admin\'s "MCP Clients" screen.',
            details: { reason, rssBytes: usage.rssBytes, cpuPercent: usage.cpuPercent },
          }),
        )
      },
    })
  }

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (trimmed === '') return
    let response: JsonRpcResponse
    try {
      response = JSON.parse(trimmed) as JsonRpcResponse
    } catch {
      return
    }
    if (typeof response.id !== 'number') return
    const entry = pending.get(response.id)
    if (entry === undefined) return
    pending.delete(response.id)
    entry.resolve(response)
  })

  function send(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    callOptions?: McpCallOptions,
  ): Promise<unknown> {
    const id = nextId++
    return new Promise((resolve, reject) => {
      let settled = false

      // Deliberately does not touch `settled`/`pending` itself: `resolve`
      // already clears this timer on a real response, so if this fires the
      // call is genuinely still outstanding. `killAndRejectAll` rejects
      // through this call's own `pending` entry below (whose `reject`
      // closure is what actually settles this promise), and every other
      // still-outstanding call on the same connection with it — a server
      // that stops answering is presumed dead for all of them, not just
      // the one that happened to hit the timeout first.
      const timer = setTimeout(() => {
        killAndRejectAll(
          new CogentaError({
            code: 'MCP_CLIENT_CALL_TIMEOUT',
            message: `"${method}" on the MCP server did not respond within ${callTimeoutMs}ms.`,
            hint: 'The server process has been killed and every pending call on this connection has been rejected. Raise callTimeoutMs only for a server known to be legitimately slow — never to mask a hang.',
          }),
        )
      }, callTimeoutMs)
      timer.unref?.()

      const onAbort = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        pending.delete(id)
        reject(
          new CogentaError({
            code: 'MCP_CLIENT_CALL_ABORTED',
            message: `"${method}" was cancelled before the MCP server responded.`,
            hint: "The caller's own signal was aborted — this is not a server failure.",
          }),
        )
      }
      callOptions?.signal?.addEventListener('abort', onAbort, { once: true })

      pending.set(id, {
        resolve: (response) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          callOptions?.signal?.removeEventListener('abort', onAbort)
          if ('error' in response) {
            reject(
              new CogentaError({
                code: 'MCP_CLIENT_REMOTE_ERROR',
                message: response.error.message,
                hint: 'The remote MCP server reported a protocol-level error, not a tool failure.',
                details: { code: response.error.code, data: response.error.data },
              }),
            )
            return
          }
          resolve(response.result)
        },
        reject: (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          callOptions?.signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
      })

      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`,
      )
    })
  }

  return {
    pid: child.pid,

    async initialize(callOptions): Promise<McpServerInfo> {
      const result = (await send('initialize', undefined, callOptions)) as {
        serverInfo: McpServerInfo
      }
      return result.serverInfo
    },
    async listTools(callOptions): Promise<readonly McpToolSpec[]> {
      const result = (await send('tools/list', undefined, callOptions)) as {
        tools: readonly McpToolSpec[]
      }
      return result.tools
    },
    async callTool(name, args, callOptions): Promise<McpToolCallResult> {
      return (await send('tools/call', { name, arguments: args }, callOptions)) as McpToolCallResult
    },
    close() {
      closed = true
      watchdog?.stop()
      rl.close()
      rejectAllPending(
        new CogentaError({
          code: 'MCP_CLIENT_CLOSED',
          message: 'This MCP connection was closed.',
          hint: 'Reconnect if you still need this server.',
        }),
      )
      try {
        child.kill()
      } catch {
        // already gone
      }
    },
  }
}
