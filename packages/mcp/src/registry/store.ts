import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { MCP_CONNECTION_TABLE } from './tables.js'

/**
 * Fiche 58 task 2/3. The registry of external MCP connections this site's
 * agent runtime may consume — never confused with `cogenta mcp` (the
 * *server* this site exposes outward, `packages/cli/src/commands/mcp.ts`,
 * unrelated code path). See `../client/stdio-client.js` for what actually
 * runs when a `stdio` connection is used, and `wrap-tool.js` for how one
 * exposed tool becomes a Contract C `ToolDefinition`.
 */

export type McpTransport = 'stdio' | 'http'
export type McpAuthKind = 'none' | 'api_key' | 'oauth'
export type McpConnectionStatus = 'unverified' | 'ok' | 'error'

export interface McpDiscoveredTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

/** One remote tool the admin has explicitly checked as exposable — "absent, pas refusée": a tool discovered but never listed here is never wrapped, never offered to a single agent. */
export interface McpExposedTool {
  /** The tool's name on the remote server — must be present in this connection's last discovered tool list. */
  readonly remoteName: string
  /** This connection's own name for it in Cogenta's tool registry — defaults to `remoteName` when not given. */
  readonly localName: string
  readonly description: string
  /** Declared by the admin at exposure time, per fiche 58 task 6 — never read from the remote server, which has no way to be trusted to declare its own blast radius. */
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: 'low' | 'medium' | 'high'
}

export interface McpConnectionSummary {
  readonly id: string
  readonly name: string
  readonly transport: McpTransport
  readonly command?: string
  readonly args: readonly string[]
  readonly url?: string
  /** Explicit, non-secret environment for a `stdio` connection — see `../client/stdio-client.js`: this is exactly, and only, what the spawned process receives, never `process.env`. */
  readonly env: Readonly<Record<string, string>>
  readonly authKind: McpAuthKind
  /** `true` once a secret has been saved — the secret itself is never returned here (same posture as `ProviderConfigStore.decryptKey`, R7). */
  readonly hasSecret: boolean
  /** For `authKind !== 'none'` on a `stdio` connection: which environment variable receives the decrypted secret at connect time. Irrelevant otherwise. */
  readonly secretEnvVar?: string
  /**
   * Fiche 58 task 1bis's mandatory, honest confirmation for a `stdio`
   * connection: whoever created it explicitly acknowledged that this
   * binary runs with the Cogenta process's own full OS privileges,
   * unsandboxed beyond `../client/stdio-client.js`'s own floor. Always
   * `true` for an `http` connection (nothing is spawned).
   */
  readonly confirmedUnsandboxed: boolean
  readonly enabled: boolean
  readonly status: McpConnectionStatus
  readonly lastError?: string
  readonly discoveredTools: readonly McpDiscoveredTool[]
  readonly lastDiscoveredAt?: string
  readonly exposedTools: readonly McpExposedTool[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface McpConnectionCreateInput {
  readonly name: string
  readonly transport: McpTransport
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Readonly<Record<string, string>>
  readonly authKind?: McpAuthKind
  readonly secret?: string
  readonly secretEnvVar?: string
  /**
   * Required `true` for a `stdio` connection. This is the structural half
   * of fiche 58 task 1bis's confirmation requirement — a UI can and must
   * show the warning (`packages/admin/src/routes/mcp-clients.tsx`), but the
   * refusal itself lives here, not only in a checkbox that markup could
   * omit: `create()` throws `MCP_CONNECTION_CONFIRMATION_REQUIRED` for every
   * `stdio` connection created without this being exactly `true`.
   */
  readonly confirmUnsandboxed?: boolean
}

export interface McpDiscoveryResult {
  readonly status: 'ok'
  readonly tools: readonly McpDiscoveredTool[]
}
export interface McpDiscoveryFailure {
  readonly status: 'error'
  readonly error: string
}

export interface McpConnectionStore {
  list(): Promise<readonly McpConnectionSummary[]>
  get(id: string): Promise<McpConnectionSummary | undefined>
  create(input: McpConnectionCreateInput): Promise<McpConnectionSummary>
  remove(id: string): Promise<void>
  setEnabled(id: string, enabled: boolean): Promise<McpConnectionSummary>
  /** Persists the result of a real `initialize()`+`tools/list()` probe (`../discovery.js`) — never invented here. A failed discovery does not clear previously exposed tools; a connection that briefly can't be reached does not silently lose its admin's prior decisions. */
  recordDiscovery(
    id: string,
    result: McpDiscoveryResult | McpDiscoveryFailure,
  ): Promise<McpConnectionSummary>
  /**
   * The admin's checkbox decision (task 3) — replaces the full exposed-tool
   * set for this connection. Every `remoteName` must be present in the
   * connection's last discovered tool list: this is what makes "jamais un
   * octroi implicite du catalogue distant entier" true structurally rather
   * than by UI convention — a caller cannot expose a tool that was never
   * actually seen on the wire.
   */
  setExposedTools(id: string, tools: readonly McpExposedTool[]): Promise<McpConnectionSummary>
  /** The one place the real secret is ever decrypted — never exposed on `McpConnectionSummary`. Throws `MCP_CONNECTION_NOT_FOUND`/`MCP_CONNECTION_AUTH_INVALID` as appropriate. */
  decryptSecret(id: string): Promise<string>
}

interface ConnectionRow {
  id: string
  name: string
  transport: string
  command: string | null
  args_json: string | null
  url: string | null
  env_json: string | null
  auth_kind: string
  secret_env_var: string | null
  secret_iv: string | null
  secret_auth_tag: string | null
  secret_ciphertext: string | null
  confirmed_unsandboxed: number | boolean
  enabled: number | boolean
  status: string
  last_error: string | null
  discovered_tools_json: string | null
  last_discovered_at: string | null
  exposed_tools_json: string
  created_at: string
  updated_at: string
}

const KEY_DERIVATION_SALT = 'cogenta-mcp-connection-secrets-v1'
const ALGORITHM = 'aes-256-gcm'

function deriveKey(signingKey: string): Buffer {
  return scryptSync(signingKey, KEY_DERIVATION_SALT, 32)
}

function connectionNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MCP_CONNECTION_NOT_FOUND',
    message: `No MCP connection with id "${id}".`,
    hint: 'Check the id against the admin\'s "MCP Clients" screen.',
  })
}

function confirmationRequired(): CogentaError {
  return new CogentaError({
    code: 'MCP_CONNECTION_CONFIRMATION_REQUIRED',
    message:
      'A "stdio" MCP connection must explicitly confirm it runs an unsandboxed third-party executable with the full OS privileges of the Cogenta server process.',
    hint: 'Pass confirmUnsandboxed: true only after the operator has actually seen and accepted that warning.',
  })
}

function toolNotDiscovered(id: string, remoteName: string): CogentaError {
  return new CogentaError({
    code: 'MCP_CONNECTION_TOOL_NOT_DISCOVERED',
    message: `"${remoteName}" was not in the last discovered tool list for connection "${id}".`,
    hint: 'Run "test connection" again, then choose only from the tools it actually returned.',
  })
}

function toSummary(row: ConnectionRow): McpConnectionSummary {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport as McpTransport,
    ...(row.command === null ? {} : { command: row.command }),
    args: row.args_json === null ? [] : (JSON.parse(row.args_json) as readonly string[]),
    ...(row.url === null ? {} : { url: row.url }),
    env:
      row.env_json === null ? {} : (JSON.parse(row.env_json) as Readonly<Record<string, string>>),
    authKind: row.auth_kind as McpAuthKind,
    hasSecret: row.secret_ciphertext !== null,
    ...(row.secret_env_var === null ? {} : { secretEnvVar: row.secret_env_var }),
    confirmedUnsandboxed: Boolean(row.confirmed_unsandboxed),
    enabled: Boolean(row.enabled),
    status: row.status as McpConnectionStatus,
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    discoveredTools:
      row.discovered_tools_json === null
        ? []
        : (JSON.parse(row.discovered_tools_json) as readonly McpDiscoveredTool[]),
    ...(row.last_discovered_at === null ? {} : { lastDiscoveredAt: row.last_discovered_at }),
    exposedTools: JSON.parse(row.exposed_tools_json) as readonly McpExposedTool[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface FileMcpConnectionStoreOptions {
  /** `COGENTA_AUTH_SIGNING_KEY` — the encryption key is derived from it, never stored itself (same posture as `ProviderConfigStore`, R7). */
  readonly signingKey: string
  readonly now?: () => number
}

export function createMcpConnectionStore(
  db: DatabaseHandle,
  options: FileMcpConnectionStoreOptions,
): McpConnectionStore {
  const now = options.now ?? Date.now
  const key = deriveKey(options.signingKey)
  const table = identifier(MCP_CONNECTION_TABLE, db.dialect)

  function encrypt(plaintext: string): { iv: string; authTag: string; ciphertext: string } {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
  }

  function decrypt(row: ConnectionRow): string {
    if (row.secret_iv === null || row.secret_auth_tag === null || row.secret_ciphertext === null) {
      throw new CogentaError({
        code: 'MCP_CONNECTION_AUTH_INVALID',
        message: `Connection "${row.id}" has no saved secret.`,
        hint: `Its authKind is "${row.auth_kind}" — save one from the admin's "MCP Clients" screen first.`,
      })
    }
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(row.secret_iv, 'base64'))
    decipher.setAuthTag(Buffer.from(row.secret_auth_tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.secret_ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  }

  async function findRow(id: string): Promise<ConnectionRow | undefined> {
    const result = await db.query<ConnectionRow>(sql`select * from ${table} where id = ${id}`)
    return result.rows[0]
  }

  return {
    async list() {
      const result = await db.query<ConnectionRow>(
        sql`select * from ${table} order by created_at asc`,
      )
      return result.rows.map(toSummary)
    },

    async get(id) {
      const row = await findRow(id)
      return row === undefined ? undefined : toSummary(row)
    },

    async create(input) {
      if (input.transport === 'stdio' && input.confirmUnsandboxed !== true) {
        throw confirmationRequired()
      }
      const authKind = input.authKind ?? 'none'
      let secretFields: Pick<ConnectionRow, 'secret_iv' | 'secret_auth_tag' | 'secret_ciphertext'>
      if (authKind !== 'none' && input.secret !== undefined) {
        const encrypted = encrypt(input.secret)
        secretFields = {
          secret_iv: encrypted.iv,
          secret_auth_tag: encrypted.authTag,
          secret_ciphertext: encrypted.ciphertext,
        }
      } else {
        secretFields = { secret_iv: null, secret_auth_tag: null, secret_ciphertext: null }
      }

      const nowIso = new Date(now()).toISOString()
      const row: Omit<ConnectionRow, 'discovered_tools_json' | 'last_discovered_at'> = {
        id: newId(now),
        name: input.name,
        transport: input.transport,
        command: input.command ?? null,
        args_json: input.args === undefined ? null : JSON.stringify(input.args),
        url: input.url ?? null,
        env_json: input.env === undefined ? null : JSON.stringify(input.env),
        auth_kind: authKind,
        secret_env_var: input.secretEnvVar ?? null,
        ...secretFields,
        // Reaching this point means either the transport is `http` (nothing
        // is spawned, so there is nothing to confirm) or it is `stdio` and
        // the guard above already required `confirmUnsandboxed === true`.
        confirmed_unsandboxed: true,
        enabled: true,
        status: 'unverified',
        last_error: null,
        exposed_tools_json: '[]',
        created_at: nowIso,
        updated_at: nowIso,
      }

      await db.query(sql`
        insert into ${table} (
          id, name, transport, command, args_json, url, env_json, auth_kind,
          secret_env_var, secret_iv, secret_auth_tag, secret_ciphertext,
          confirmed_unsandboxed, enabled, status, last_error,
          discovered_tools_json, last_discovered_at, exposed_tools_json,
          created_at, updated_at
        ) values (
          ${row.id}, ${row.name}, ${row.transport}, ${row.command}, ${row.args_json}, ${row.url}, ${row.env_json}, ${row.auth_kind},
          ${row.secret_env_var}, ${row.secret_iv}, ${row.secret_auth_tag}, ${row.secret_ciphertext},
          ${row.confirmed_unsandboxed}, ${row.enabled}, ${row.status}, ${row.last_error},
          ${null}, ${null}, ${row.exposed_tools_json},
          ${row.created_at}, ${row.updated_at}
        )`)

      const saved = await findRow(row.id)
      if (saved === undefined) throw connectionNotFound(row.id)
      return toSummary(saved)
    },

    async remove(id) {
      await db.query(sql`delete from ${table} where id = ${id}`)
    },

    async setEnabled(id, enabled) {
      const row = await findRow(id)
      if (row === undefined) throw connectionNotFound(id)
      const updatedAt = new Date(now()).toISOString()
      await db.query(
        sql`update ${table} set enabled = ${enabled}, updated_at = ${updatedAt} where id = ${id}`,
      )
      return toSummary({ ...row, enabled, updated_at: updatedAt })
    },

    async recordDiscovery(id, result) {
      const row = await findRow(id)
      if (row === undefined) throw connectionNotFound(id)
      const updatedAt = new Date(now()).toISOString()
      if (result.status === 'ok') {
        const discoveredJson = JSON.stringify(result.tools)
        await db.query(sql`
          update ${table}
          set status = ${'ok'}, last_error = ${null},
              discovered_tools_json = ${discoveredJson}, last_discovered_at = ${updatedAt},
              updated_at = ${updatedAt}
          where id = ${id}`)
        return toSummary({
          ...row,
          status: 'ok',
          last_error: null,
          discovered_tools_json: discoveredJson,
          last_discovered_at: updatedAt,
          updated_at: updatedAt,
        })
      }
      await db.query(sql`
        update ${table} set status = ${'error'}, last_error = ${result.error}, updated_at = ${updatedAt}
        where id = ${id}`)
      return toSummary({ ...row, status: 'error', last_error: result.error, updated_at: updatedAt })
    },

    async setExposedTools(id, tools) {
      const row = await findRow(id)
      if (row === undefined) throw connectionNotFound(id)
      const discovered = new Set(
        (row.discovered_tools_json === null
          ? []
          : (JSON.parse(row.discovered_tools_json) as readonly McpDiscoveredTool[])
        ).map((tool) => tool.name),
      )
      for (const tool of tools) {
        if (!discovered.has(tool.remoteName)) throw toolNotDiscovered(id, tool.remoteName)
      }
      const updatedAt = new Date(now()).toISOString()
      const exposedJson = JSON.stringify(tools)
      await db.query(sql`
        update ${table} set exposed_tools_json = ${exposedJson}, updated_at = ${updatedAt}
        where id = ${id}`)
      return toSummary({ ...row, exposed_tools_json: exposedJson, updated_at: updatedAt })
    },

    async decryptSecret(id) {
      const row = await findRow(id)
      if (row === undefined) throw connectionNotFound(id)
      return decrypt(row)
    },
  }
}
