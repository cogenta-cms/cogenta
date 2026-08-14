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

export interface McpClient {
  initialize(): Promise<McpServerInfo>
  listTools(): Promise<readonly McpToolSpec[]>
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<McpToolCallResult>
  close(): void
}

/** The minimal shape a spawned MCP server process needs — real `child_process.spawn()` already satisfies this; tests inject a fake. */
export interface ChildProcessLike {
  readonly stdin: Writable
  readonly stdout: Readable
  kill(): void
}
