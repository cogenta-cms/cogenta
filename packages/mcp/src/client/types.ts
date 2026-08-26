import type { Readable, Writable } from 'node:stream'

export interface McpToolSpec {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export interface McpContentBlock {
  readonly type: string
  readonly text: string
}

export interface McpToolCallResult {
  readonly content: readonly McpContentBlock[]
  readonly isError: boolean
}

export interface McpServerInfo {
  readonly name: string
  readonly version: string
}

/** Per-call cancellation — distinct from the connection-wide hard timeout every call already has (fiche 58 task 1bis): a caller can cancel one in-flight call early (e.g. the agent run's own `ctx.signal`), which — like the timeout — kills the underlying process rather than leaving it running unobserved. */
export interface McpCallOptions {
  readonly signal?: AbortSignal
}

export interface McpClient {
  initialize(options?: McpCallOptions): Promise<McpServerInfo>
  listTools(options?: McpCallOptions): Promise<readonly McpToolSpec[]>
  callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    options?: McpCallOptions,
  ): Promise<McpToolCallResult>
  /** The OS process id backing this connection, when known — `undefined` for a fake used in a test. Exposed so a caller can run its own external supervision (a cgroup, a Job Object) against the real process, on top of this client's own best-effort watchdog. */
  readonly pid: number | undefined
  close(): void
}

/**
 * The minimal shape a spawned MCP server process needs — real
 * `child_process.spawn()` already satisfies this structurally; tests inject
 * a fake. `stderr`/`pid`/`once` are new since fiche 58 task 1bis: stdio is
 * always `['pipe', 'pipe', 'pipe']` now (never `inherit`), so stderr must be
 * readable from here, `pid` backs the memory/CPU watchdog, and `once` lets
 * the client notice the process dying on its own (crash, kill from outside)
 * instead of leaving pending calls hanging forever.
 */
export interface ChildProcessLike {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr?: Readable
  readonly pid?: number
  kill(): void
  once?(event: 'exit' | 'error', listener: (...args: unknown[]) => void): void
}
