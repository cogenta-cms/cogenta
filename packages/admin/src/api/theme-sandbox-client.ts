import { API_BASE, ApiError, authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/theme/sandbox`, `/api/theme/:name/versions`,
 * `/api/theme/:name/export` and `/api/theme/import` (fiche 73) — hand-mirrored
 * from `serve.ts`'s own route block, the same way every other `*-client.ts`
 * here copies its server-side shape by hand.
 */

export function listSandboxIds(token: string): Promise<{ readonly ids: readonly string[] }> {
  return request<{ readonly ids: readonly string[] }>('/api/theme/sandbox', {
    headers: authHeader(token),
  })
}

export function createSandbox(
  token: string,
  input: { readonly id: string; readonly cloneFrom?: string },
): Promise<{ readonly id: string }> {
  return request<{ readonly id: string }>('/api/theme/sandbox', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export type SandboxPreviewResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly error: string }

export function previewSandbox(
  token: string,
  id: string,
  siteName?: string,
): Promise<SandboxPreviewResult> {
  const query = siteName === undefined ? '' : `?siteName=${encodeURIComponent(siteName)}`
  return request<SandboxPreviewResult>(
    `/api/theme/sandbox/${encodeURIComponent(id)}/preview${query}`,
    {
      headers: authHeader(token),
    },
  )
}

export interface ThemeDeploymentCheck {
  readonly ok: boolean
  readonly reasons: readonly string[]
}

export function checkSandboxDeployment(
  token: string,
  id: string,
  themeName: string,
): Promise<ThemeDeploymentCheck> {
  return request<ThemeDeploymentCheck>(
    `/api/theme/sandbox/${encodeURIComponent(id)}/check?themeName=${encodeURIComponent(themeName)}`,
    { headers: authHeader(token) },
  )
}

export type ThemeDeploymentResult =
  | {
      readonly ok: true
      readonly themeDirectory: string
      readonly previousVersionDirectory: string | null
    }
  | { readonly ok: false; readonly reasons: readonly string[] }

export function deploySandbox(
  token: string,
  id: string,
  themeName: string,
): Promise<ThemeDeploymentResult> {
  return request<ThemeDeploymentResult>(`/api/theme/sandbox/${encodeURIComponent(id)}/deploy`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ themeName }),
  })
}

export interface ThemeVersionInfo {
  readonly timestamp: string
  readonly directory: string
}

export function listThemeVersions(
  token: string,
  themeName: string,
): Promise<{ readonly versions: readonly ThemeVersionInfo[] }> {
  return request<{ readonly versions: readonly ThemeVersionInfo[] }>(
    `/api/theme/${encodeURIComponent(themeName)}/versions`,
    { headers: authHeader(token) },
  )
}

export type ThemeRestoreResult =
  | {
      readonly ok: true
      readonly themeDirectory: string
      readonly archivedCurrentDirectory: string | null
    }
  | { readonly ok: false; readonly reasons: readonly string[] }

export function restoreThemeVersion(
  token: string,
  themeName: string,
  timestamp: string,
): Promise<ThemeRestoreResult> {
  return request<ThemeRestoreResult>(
    `/api/theme/${encodeURIComponent(themeName)}/versions/${encodeURIComponent(timestamp)}/restore`,
    { method: 'POST', headers: authHeader(token) },
  )
}

/** Streams `GET /api/theme/:name/export` to a real browser download — same technique `downloadSubmissionsCsv` (`forms-client.ts`) already uses for its own server-streamed export. */
export async function downloadThemeExport(token: string, themeName: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/theme/${encodeURIComponent(themeName)}/export`, {
    headers: authHeader(token),
  })
  if (!response.ok) {
    throw new ApiError('INTERNAL', 'The export could not be downloaded.', undefined)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${themeName}.zip`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function importThemeZip(
  token: string,
  input: { readonly sandboxId: string; readonly zipBase64: string },
): Promise<{ readonly sandboxId: string }> {
  return request<{ readonly sandboxId: string }>('/api/theme/import', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** Reads a `.zip` the browser handed us into the base64 envelope `importThemeZip` takes — same chunked-encoding technique as `toGenerateThemeAttachment` (`theme-client.ts`). */
export async function toZipBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}
