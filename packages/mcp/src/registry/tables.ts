import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const MCP_CONNECTION_TABLE = 'mcp_connections'

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/** Same convention `@cogenta/auth`'s `tables.ts` already uses. */
function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'boolean' : 'tinyint')
}

/**
 * Fiche 58 task 2. Owned by `@cogenta/mcp`, following `@cogenta/plugins`'s
 * `ensurePluginTables` pattern exactly: `create table if not exists`, run
 * once at startup, no separate migration file — this is registry/config
 * state for the current running process, not Contract A content.
 *
 * One row per configured external MCP connection. Everything a `stdio`
 * connection needs to actually spawn (`command`/`args`/`env`) lives here in
 * the clear — none of it is a secret by itself — while `secret_*` (the
 * bearer/API key/OAuth token this *connection* authenticates itself with,
 * for `auth_kind !== 'none'`) is the one thing encrypted at rest, same
 * AES-256-GCM scheme as `@cogenta/agents`' `ProviderConfigStore` (R7: key
 * derived from `COGENTA_AUTH_SIGNING_KEY`, no second secret to manage).
 *
 * `exposed_tools_json` is the admin's own checkbox decision (task 3) — the
 * whole reason this is not simply "every tool `tools/list` returns is
 * available": "absent, pas refusée" (fiche's own words, borrowed from
 * `@cogenta/plugins`'s capability model) — a tool never checked here is
 * never wrapped, never in an agent's manifest, full stop.
 */
export async function ensureMcpConnectionTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const connections = identifier(MCP_CONNECTION_TABLE, d)
  const t255 = textColumn(d, 255)
  const t2048 = textColumn(d, 2048)
  const tText = unsafeRaw('text')
  const tBool = booleanColumn(d)

  await db.query(sql`
    create table if not exists ${connections} (
      id ${t255} not null primary key,
      name ${t255} not null,
      transport ${t255} not null,
      command ${t2048},
      args_json ${tText},
      url ${t2048},
      env_json ${tText},
      auth_kind ${t255} not null,
      secret_env_var ${t255},
      secret_iv ${t255},
      secret_auth_tag ${t255},
      secret_ciphertext ${tText},
      confirmed_unsandboxed ${tBool} not null,
      enabled ${tBool} not null,
      status ${t255} not null,
      last_error ${tText},
      discovered_tools_json ${tText},
      last_discovered_at ${t255},
      exposed_tools_json ${tText} not null,
      created_at ${t255} not null,
      updated_at ${t255} not null
    )`)

  await db
    .query(
      sql`create index ${identifier('cogenta_mcp_connections_name', d)} on ${connections} (name)`,
    )
    .catch(() => undefined) // already there — no portable "if not exists" for indexes
}
