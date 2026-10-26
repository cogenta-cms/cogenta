import { describe, expect, it } from 'vitest'
import {
  claudeCodeHttpCommand,
  claudeCodeHttpJson,
  claudeCodeStdioCommand,
  claudeDesktopHttpJson,
  mcpEndpointUrl,
  stdioJson,
  stdioTerminalCommand,
} from '../../src/routes/mcp-snippets.js'

const KEY = 'cogenta_sk_abc123'
const STDIO = {
  command: '/usr/local/bin/node',
  args: ['/srv/my site/node_modules/@cogenta/cli/dist/bin.js', 'mcp', '--cwd', '/srv/my site'],
  projectRoot: '/srv/my site',
  apiKeyEnv: 'COGENTA_MCP_API_KEY',
}

describe('MCP client configuration snippets', () => {
  it('builds the endpoint from the origin the admin is served on', () => {
    expect(
      mcpEndpointUrl('https://site.example/', { http: { enabled: true, path: '/api/mcp' } }),
    ).toBe('https://site.example/api/mcp')
  })

  it('gives Claude Code the remote endpoint with the key as a bearer header', () => {
    expect(claudeCodeHttpCommand('https://site.example/api/mcp', KEY)).toBe(
      `claude mcp add --transport http cogenta https://site.example/api/mcp --header "Authorization: Bearer ${KEY}"`,
    )
    expect(JSON.parse(claudeCodeHttpJson('https://site.example/api/mcp', KEY))).toEqual({
      mcpServers: {
        cogenta: {
          type: 'http',
          url: 'https://site.example/api/mcp',
          headers: { Authorization: `Bearer ${KEY}` },
        },
      },
    })
  })

  it('bridges Claude Desktop through mcp-remote with the key in env, not on the command line', () => {
    const config = JSON.parse(claudeDesktopHttpJson('https://site.example/api/mcp', KEY)) as {
      mcpServers: { cogenta: { command: string; args: string[]; env: Record<string, string> } }
    }
    expect(config.mcpServers.cogenta.command).toBe('npx')
    expect(config.mcpServers.cogenta.args).toContain('mcp-remote')
    expect(config.mcpServers.cogenta.args.join(' ')).not.toContain(KEY)
    expect(config.mcpServers.cogenta.env['COGENTA_AUTH']).toBe(`Bearer ${KEY}`)
  })

  it('runs the local server with --cwd in args and the key in env, never a cwd field nor --api-key', () => {
    const config = JSON.parse(stdioJson(STDIO, KEY)) as {
      mcpServers: {
        cogenta: Record<string, unknown> & { args: string[]; env: Record<string, string> }
      }
    }
    const server = config.mcpServers.cogenta
    expect(server['command']).toBe('/usr/local/bin/node')
    expect(server.args).toEqual(STDIO.args)
    expect(server.env).toEqual({ COGENTA_MCP_API_KEY: KEY })
    expect(server['cwd']).toBeUndefined()
    expect(server.args).not.toContain('--api-key')
  })

  it('quotes paths with spaces in the shell commands', () => {
    expect(claudeCodeStdioCommand(STDIO, KEY)).toBe(
      `claude mcp add cogenta --env COGENTA_MCP_API_KEY=${KEY} -- /usr/local/bin/node "/srv/my site/node_modules/@cogenta/cli/dist/bin.js" mcp --cwd "/srv/my site"`,
    )
    expect(stdioTerminalCommand(STDIO, KEY)).toBe(
      `COGENTA_MCP_API_KEY=${KEY} /usr/local/bin/node "/srv/my site/node_modules/@cogenta/cli/dist/bin.js" mcp --cwd "/srv/my site"`,
    )
  })
})
