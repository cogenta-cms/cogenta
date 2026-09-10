import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/theme` — hand-mirrored from
 * `@cogenta/api`'s `theme-router.ts`, the same way every other
 * `*-client.ts` in this directory copies its server-side shape by hand.
 */

export interface ThemeOverrides {
  readonly tokenOverrides: Record<string, unknown> | null
  readonly additionalCss: string | null
  readonly logoMediaId: string | null
  readonly logoDarkMediaId: string | null
  readonly faviconMediaId: string | null
  readonly shareImageMediaId: string | null
  /** The active theme *package* name (fiche L23), or `null` for the built-in default. */
  readonly activeTheme: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

/** One entry of the theme gallery — a package this instance can render the public site with. */
export interface AvailableTheme {
  readonly name: string
  readonly label: string
  readonly description: string
  /** The theme contract's own version (`ThemeManifest.version`), distinct from the npm package version — fiche 48. */
  readonly version: string
  /** Who publishes the theme, or `null` when it does not declare one. */
  readonly author: string | null
  /** `true` for a real local theme (a folder under `themes/`, deletable); `false` for an npm-packaged built-in — decides whether the appearance gallery offers "Supprimer" on this card at all. */
  readonly local: boolean
}

export interface GallerySkin {
  readonly id: string
  readonly displayName: string
  readonly description: string | null
  readonly submittedAt: string
  readonly tokens: Record<string, unknown> | null
}

export interface ThemeState {
  readonly fileTokens: Record<string, unknown> | null
  readonly effectiveTokens: Record<string, unknown> | null
  readonly overrides: ThemeOverrides
  readonly skins: readonly GallerySkin[]
  readonly aiAvailable: boolean
  readonly exportAvailable: boolean
  readonly availableThemes: readonly AvailableTheme[]
}

export interface SkinCandidate {
  readonly kind: 'tokens'
  readonly id: string
  readonly label: string
  readonly rationale: string
  /**
   * One short sentence about this candidate, safe to put on a card.
   *
   * `rationale` is whatever the agent wrote, and a real run has returned
   * several thousand words in it — which is worth reading in the
   * conversation, and unreadable in a fixed-height panel. A caller shows
   * `summary` and keeps `rationale` behind a disclosure. Optional here
   * because a `tokens` candidate is not guaranteed to carry one; falling back
   * to `rationale` is the caller's job.
   */
  readonly summary?: string
  readonly tokens: Record<string, unknown>
  /** Which installed theme *package* this candidate targets — absent means the currently active theme. */
  readonly themeName?: string
  /**
   * `general.tagline`/`general.footerNote` (contract D `theme@1.4`) the
   * candidate proposes — informational only. Activating a candidate never
   * writes these: they live in site settings, not in the theme-overrides row
   * `PUT /api/theme/overrides` writes, and inventing a second write path for
   * them here would be scope this screen was not asked to cover.
   */
  readonly chromeInput?: {
    readonly tagline?: string
    readonly footerNote?: string
  }
}

/**
 * The other shape `POST /api/theme/generate` can now return: a fully custom
 * page layout, written by a real agent run into one sandbox directory
 * (`@cogenta/agents-builtin`'s `generateSandboxTheme`) rather than contract D
 * tokens overlaid on an already-installed theme — the fix for a real report
 * that this screen could only ever recolour whichever theme was already
 * active, never change the actual layout a reference screenshot showed.
 * Never applied by this response either: previewing it reuses the sandbox
 * screen's own `previewSandbox`, and activating it reuses its own
 * `checkSandboxDeployment`/`deploySandbox`, both already existing.
 */
export interface SandboxThemeCandidate {
  readonly kind: 'sandbox'
  readonly id: string
  readonly label: string
  readonly rationale: string
  /** Short and guaranteed on this shape — see `SkinCandidate.summary` for why it exists at all. */
  readonly summary?: string
  readonly sandboxId: string
  readonly filesWritten: readonly string[]
}

export type ThemeGenerateCandidate = SkinCandidate | SandboxThemeCandidate

/**
 * A file read into the base64 envelope `POST /api/theme/generate` takes for
 * an attachment (a screenshot, a mockup) — the same shape
 * `toUploadedDocument` (`site-plan-client.ts`) reads for a brief's documents,
 * plus the browser's own `File.type`, which an image attachment actually
 * needs to be told apart from a document and a text brief does not.
 */
export interface GenerateThemeAttachment {
  readonly filename: string
  readonly mimeType: string
  readonly contentBase64: string
}

/** Present only for "customize the current theme" — the server resolves the real current tokens itself from this name, so this carries only the intent. */
export interface GenerateThemeBaseline {
  readonly themeName: string
}

export function getTheme(token: string): Promise<ThemeState> {
  return request<ThemeState>('/api/theme', { headers: authHeader(token) })
}

export function saveThemeOverrides(
  token: string,
  input: {
    readonly tokenOverrides?: Record<string, unknown> | null
    readonly additionalCss?: string | null
    readonly logoMediaId?: string | null
    readonly logoDarkMediaId?: string | null
    readonly faviconMediaId?: string | null
    readonly shareImageMediaId?: string | null
    readonly activeTheme?: string | null
  },
): Promise<ThemeOverrides> {
  return request<ThemeOverrides>('/api/theme/overrides', {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function clearThemeOverrides(token: string): Promise<ThemeOverrides> {
  return request<ThemeOverrides>('/api/theme/overrides', {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/**
 * `DELETE /api/theme/:name` — removes a local theme (`themes/<name>/`) and
 * its whole archived version history entirely. Never offered for a built-in
 * theme (`AvailableTheme.local` decides that on the calling screen); if the
 * deleted theme was the site's own `activeTheme`, the server clears that
 * override too, so the site falls back to the default theme rather than
 * the row staying stuck naming a theme that no longer exists.
 */
export function deleteTheme(token: string, name: string): Promise<{ readonly ok: boolean }> {
  return request<{ readonly ok: boolean }>(`/api/theme/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function applyGallerySkin(token: string, id: string): Promise<ThemeOverrides> {
  return request<ThemeOverrides>(`/api/theme/skins/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/**
 * `POST /api/theme/generate` — widened (fiche "Cogenta Theme Creator") to
 * take optional attachments and an optional "customize this theme rather
 * than starting over" baseline, on top of the description this already
 * took. The response also gains `warnings` (e.g. "an attachment could not be
 * analyzed") — always present as an array in the type, so a caller filters
 * an absent-vs-empty response with the same `?? []` either way, but genuinely
 * optional on the wire since an older server never sent the field at all.
 */
export function generateSkinCandidates(
  token: string,
  input: {
    readonly description: string
    readonly attachments?: readonly GenerateThemeAttachment[]
    readonly baseline?: GenerateThemeBaseline
  },
): Promise<{
  readonly candidates: readonly ThemeGenerateCandidate[]
  readonly warnings?: readonly string[]
}> {
  return request<{
    readonly candidates: readonly ThemeGenerateCandidate[]
    readonly warnings?: readonly string[]
  }>('/api/theme/generate', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** One reported line — see `@cogenta/agents`' own `ProgressEvent`. */
export interface ThemeGenerateProgressEvent {
  readonly at: number
  readonly message: string
  /**
   * What the line is, decided by the runtime that produced it rather than
   * by reading its wording here. Optional because a job started before
   * structured events existed carries none — the log falls back to
   * classifying the message itself (`classifyActivityMessage`).
   */
  readonly kind?: 'thinking' | 'tool-call' | 'tool-ok' | 'tool-failed' | 'stage' | 'warning'
  readonly tool?: string
}

/**
 * Fiche feedback — "je ne sais pas si le traitement est en cours ou pas".
 * A watchable twin of `generateSkinCandidates` above: start one of these,
 * then poll `getThemeGenerateJob` until `status` leaves `'running'`,
 * rendering `events` as they grow.
 */
export interface ThemeGenerateJob {
  readonly status: 'running' | 'done' | 'failed'
  readonly events: readonly ThemeGenerateProgressEvent[]
  readonly result?: {
    readonly candidates: readonly ThemeGenerateCandidate[]
    readonly warnings?: readonly string[]
  }
  readonly error?: { readonly message: string }
}

export function startThemeGenerateJob(
  token: string,
  input: {
    readonly description: string
    readonly attachments?: readonly GenerateThemeAttachment[]
    readonly baseline?: GenerateThemeBaseline
  },
): Promise<{ readonly jobId: string }> {
  return request<{ readonly jobId: string }>('/api/theme/generate/jobs', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/**
 * One already-exchanged turn of the theme conversation, as the refinement
 * route needs to be told about it. `message` is what was said in human
 * terms — the operator's own words for a `user` turn, the agent's own
 * `summary`/`rationale` for an `agent` one. Never a tool trace: the run log
 * belongs to the screen, not to the next prompt.
 */
export interface ThemeConversationTurn {
  readonly role: 'user' | 'agent'
  readonly message: string
}

/**
 * The second half of the workshop conversation: "make it darker", "put the
 * grid on two columns" — a change to the theme the agent has *already*
 * written into a sandbox, rather than a fresh generation from scratch.
 *
 * Watchable exactly like `startThemeGenerateJob`: it answers with a job id
 * polled through the same `getThemeGenerateJob` below, reports the same
 * progress events, and settles into the same `result.candidates` — which is
 * why the screen has one polling loop rather than two.
 *
 * `POST /api/theme/refine/jobs` deliberately answers with a job the
 * *generate* endpoint polls: one job store, one polling loop, and a
 * conversation that does not care which kind of turn it is waiting on.
 */
export function startThemeRefineJob(
  token: string,
  input: {
    /** The sandbox the agent wrote on the turn being refined — what it re-reads before changing anything. Present for a custom-layout candidate. */
    readonly sandboxId?: string
    /**
     * The token candidate being adjusted, for the other shape — its current
     * values become the starting point. Without them the server would
     * re-derive a palette from the brief, which is what made every follow-up
     * come back as a different theme instead of the same one, changed.
     */
    readonly baseline?: {
      readonly themeName?: string
      readonly tokens: Record<string, unknown>
    }
    /** The operator's follow-up, in their own words. */
    readonly message: string
    readonly attachments?: readonly GenerateThemeAttachment[]
    /** Every earlier turn, oldest first, so the agent sees the conversation and not just the last sentence. */
    readonly previousTurns?: readonly ThemeConversationTurn[]
  },
): Promise<{ readonly jobId: string }> {
  return request<{ readonly jobId: string }>('/api/theme/refine/jobs', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function getThemeGenerateJob(token: string, jobId: string): Promise<ThemeGenerateJob> {
  return request<ThemeGenerateJob>(`/api/theme/generate/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeader(token),
  })
}

/** Reads a file the browser handed us into the base64 envelope `generateSkinCandidates` takes — same chunked-encoding technique as `toUploadedDocument` (`site-plan-client.ts`), plus the file's own MIME type. */
export async function toGenerateThemeAttachment(file: File): Promise<GenerateThemeAttachment> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return { filename: file.name, mimeType: file.type, contentBase64: btoa(binary) }
}

export function exportThemeToFile(token: string): Promise<{ readonly exported: boolean }> {
  return request<{ readonly exported: boolean }>('/api/theme/export', {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function previewTheme(
  token: string,
  input: {
    readonly pathname?: string
    readonly tokens?: Record<string, unknown>
    readonly additionalCss?: string
  },
): Promise<{ readonly html: string }> {
  return request<{ readonly html: string }>('/api/theme/preview', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/**
 * The theme *gallery*'s visual preview (fiche L24 task 5) — a fixed,
 * database-free demo page rendered through one candidate theme package,
 * distinct from `previewTheme` above (a colour/token candidate on the site's
 * own real home page, in the currently active theme). Every card in the
 * gallery calls this once, by name, so switching which theme is shown never
 * touches `PUT /api/theme/overrides`.
 *
 * `tokens` (L26 task 5) previews a Theme Creator candidate's *own* skin
 * against a theme package this site is not currently running — the
 * combination `previewTheme` above cannot express, since it only ever
 * renders the active theme. Omitted, this renders exactly as before: the
 * named theme's own on-disk default skin.
 */
export function previewThemeGallery(
  token: string,
  theme: string,
  tokens?: Record<string, unknown>,
): Promise<{ readonly html: string }> {
  return request<{ readonly html: string }>('/api/theme/gallery-preview', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ theme, ...(tokens === undefined ? {} : { tokens }) }),
  })
}
