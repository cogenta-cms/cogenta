import { authHeader, request } from './http.js'

/**
 * The fetch layer over `/api/plugins` (L31 step 4), hand-mirrored from the
 * host's routes the way every other client here mirrors its router.
 */

export interface InstalledPlugin {
  readonly name: string
  readonly version: string
  /** What its manifest asks for. */
  readonly capabilities: readonly string[]
  /** What it has actually been granted — the difference is the whole point of the screen. */
  readonly granted: readonly string[]
  readonly provides: {
    readonly eventSubscriptions?: readonly string[]
    readonly routes?: readonly string[]
    readonly schedules?: readonly { readonly name: string; readonly everyMinutes: number }[]
  }
  readonly devMode: boolean
  readonly hasCode: boolean
}

export interface PluginFailure {
  readonly directory: string
  readonly code: string
  readonly message: string
}

export interface PluginsState {
  readonly installed: readonly InstalledPlugin[]
  readonly failures: readonly PluginFailure[]
  readonly sandboxes: readonly string[]
}

export interface SandboxCheck {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly handlers: readonly string[]
  readonly unimplemented: readonly string[]
  readonly manifest: { readonly name: string; readonly capabilities: readonly string[] } | null
}

export interface SandboxState {
  readonly id: string
  readonly files: readonly string[]
  readonly check: SandboxCheck
}

export interface PluginDeployment {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly installedAt?: string
  readonly backupAt?: string
  readonly capabilities?: readonly string[]
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export function getPlugins(token: string): Promise<PluginsState> {
  return request('/api/plugins', { headers: authHeader(token) })
}

export function createSandbox(token: string, id: string, name?: string): Promise<{ id: string }> {
  return request('/api/plugins/sandbox', {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ id, ...(name === undefined || name === '' ? {} : { name }) }),
  })
}

export function getSandbox(token: string, id: string): Promise<SandboxState> {
  return request(`/api/plugins/sandbox/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export function readSandboxFile(
  token: string,
  id: string,
  path: string,
): Promise<{ readonly content: string }> {
  return request(
    `/api/plugins/sandbox/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`,
    { headers: authHeader(token) },
  )
}

export function writeSandboxFile(
  token: string,
  id: string,
  path: string,
  content: string,
): Promise<{ readonly path: string }> {
  return request(
    `/api/plugins/sandbox/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`,
    {
      method: 'PUT',
      headers: { ...authHeader(token), ...JSON_HEADERS },
      body: JSON.stringify({ content }),
    },
  )
}

export function deploySandbox(
  token: string,
  id: string,
  overwrite: boolean,
): Promise<PluginDeployment> {
  return request(`/api/plugins/sandbox/${encodeURIComponent(id)}/deploy`, {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ overwrite }),
  })
}

export function grantCapability(
  token: string,
  plugin: string,
  capability: string,
): Promise<{ readonly plugin: string; readonly capability: string }> {
  return request(`/api/plugins/${encodeURIComponent(plugin)}/grants`, {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ capability }),
  })
}

export function revokeCapability(token: string, plugin: string, capability: string): Promise<null> {
  return request(
    `/api/plugins/${encodeURIComponent(plugin)}/grants?capability=${encodeURIComponent(capability)}`,
    { method: 'DELETE', headers: authHeader(token) },
  )
}
