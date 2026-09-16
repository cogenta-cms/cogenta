import { authHeader, request } from './http.js'

/**
 * The fetch layer over `/api/plugins` (L31 step 4), hand-mirrored from the
 * host's routes the way every other client here mirrors its router.
 */

export interface InstalledPlugin {
  /** The package name: what its directory, its grants and its install target are keyed on. */
  readonly name: string
  /** What to call it in front of a person, when the manifest says so. */
  readonly title: string | null
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
  /** Set when the plugin does not run: a person switched it off, or the site did. */
  readonly disabled: {
    readonly reason: 'timeout' | 'memory' | 'crash' | 'manual'
    readonly disabledAt: string
    readonly details: string | null
  } | null
}

export interface PluginFailure {
  readonly directory: string
  readonly code: string
  readonly message: string
}

/** A plugin being written: described from its manifest, without running its code. */
export interface PluginDraft {
  readonly id: string
  readonly name: string
  readonly title: string | null
  readonly version: string
  readonly capabilities: readonly string[]
  readonly provides: InstalledPlugin['provides']
  readonly readable: boolean
}

/** A starting point offered at creation time — the screen puts words on each `id`. */
export interface PluginTemplateOption {
  readonly id: string
  readonly capabilities: readonly string[]
  readonly provides: InstalledPlugin['provides']
}

export interface PluginsState {
  readonly installed: readonly InstalledPlugin[]
  readonly failures: readonly PluginFailure[]
  readonly sandboxes: readonly PluginDraft[]
  readonly templates: readonly PluginTemplateOption[]
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

/** The host derives the directory from the name: a person names a plugin, not a folder. */
export function createSandbox(
  token: string,
  name: string,
  template: string,
): Promise<{ id: string }> {
  return request('/api/plugins/sandbox', {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ name, template }),
  })
}

export function deleteSandbox(token: string, id: string): Promise<null> {
  return request(`/api/plugins/sandbox/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function uninstallPlugin(
  token: string,
  plugin: string,
): Promise<{
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly backupAt?: string
}> {
  return request(`/api/plugins/${encodeURIComponent(plugin)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function setPluginDisabled(
  token: string,
  plugin: string,
  disabled: boolean,
): Promise<{ readonly plugin: string; readonly disabled: boolean }> {
  return request(`/api/plugins/${encodeURIComponent(plugin)}/state`, {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ disabled }),
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

/**
 * The blocks this site's plugins provide (L32). The seventeen of the
 * vocabulary are baked into this bundle; these depend on which plugins the
 * site has installed, so only the server knows them.
 *
 * Readable by anyone who may edit content, not only an administrator: without
 * it, a plugin's block on the page being edited would have no label and no
 * fields.
 */
export function getPluginBlocks(token: string): Promise<{
  readonly blocks: readonly {
    readonly name: string
    readonly label: string
    readonly fields: readonly {
      readonly name: string
      readonly kind: string
      readonly required: boolean
      readonly localized: boolean
      readonly unique: false
      readonly hasCustomValidation: false
      readonly options: Readonly<Record<string, unknown>>
      readonly admin?: { readonly label?: string; readonly help?: string }
    }[]
    readonly plugin: string
    readonly fallback: string
  }[]
}> {
  return request('/api/plugins/blocks', { headers: authHeader(token) })
}
