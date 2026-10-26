import type { McpConnectionInfo } from '../api/mcp-info-client.js'

/**
 * The client configurations the "MCP" screen prints after a key is created —
 * pure functions, so what a user pastes is tested rather than eyeballed.
 *
 * Two ways in, because they answer two different situations:
 *
 * - **remote (HTTP)**: the assistant runs on the user's own computer and the
 *   site is deployed elsewhere. `POST <site>/api/mcp` with the key as a
 *   bearer token. Claude Code speaks this natively (`"type": "http"`);
 *   Claude Desktop's configuration file only starts local processes, so it
 *   goes through `mcp-remote`, the usual stdio-to-HTTP bridge, with the key
 *   in `env` rather than on the command line.
 * - **local (stdio)**: the assistant runs on the site's own machine. The
 *   command is the absolute Node binary and CLI script serving this site,
 *   with `--cwd` in `args` — Claude Code does not read a `cwd` field, and
 *   `npx cogenta` only resolves from inside the site's folder. The key goes
 *   in `env` (`COGENTA_MCP_API_KEY`), never in `args`, where `ps` shows it to
 *   every user of the machine.
 */

export const MCP_SERVER_NAME = 'cogenta'

function quote(value: string): string {
  return /^[\w./:@=-]+$/u.test(value) ? value : `"${value.replace(/(["\\$`])/gu, '\\$1')}"`
}

export function mcpEndpointUrl(origin: string, info: Pick<McpConnectionInfo, 'http'>): string {
  return `${origin.replace(/\/+$/u, '')}${info.http.path}`
}

/** `claude mcp add` for the remote endpoint — one line in a terminal, then Claude Code has it. */
export function claudeCodeHttpCommand(url: string, key: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header ${quote(`Authorization: Bearer ${key}`)}`
}

/** The same, as a project's `.mcp.json`. */
export function claudeCodeHttpJson(url: string, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } },
      },
    },
    null,
    2,
  )
}

/** Claude Desktop (`claude_desktop_config.json`), through `mcp-remote`. */
export function claudeDesktopHttpJson(url: string, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: 'npx',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal placeholder mcp-remote expands from `env`, so the key never sits in `args`.
          args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${COGENTA_AUTH}'],
          env: { COGENTA_AUTH: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  )
}

type Stdio = NonNullable<McpConnectionInfo['stdio']>

/** `claude mcp add` for a client on the site's own machine. */
export function claudeCodeStdioCommand(stdio: Stdio, key: string): string {
  return [
    `claude mcp add ${MCP_SERVER_NAME} --env ${stdio.apiKeyEnv}=${key} --`,
    quote(stdio.command),
    ...stdio.args.map(quote),
  ].join(' ')
}

/** `.mcp.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop) — the same block works in both. */
export function stdioJson(stdio: Stdio, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: stdio.command,
          args: stdio.args,
          env: { [stdio.apiKeyEnv]: key },
        },
      },
    },
    null,
    2,
  )
}

/** To try it by hand in a terminal: it waits for a client on its standard input. */
export function stdioTerminalCommand(stdio: Stdio, key: string): string {
  return [`${stdio.apiKeyEnv}=${key}`, quote(stdio.command), ...stdio.args.map(quote)].join(' ')
}
