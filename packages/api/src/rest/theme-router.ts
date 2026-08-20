import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/theme` — fiche 14: the "Apparence" screen's server side.
 *
 * The design this router assumes (fiche 14 task 0, option (b), the fiche's
 * own recommendation): `theme.tokens.json` next to the project's config
 * stays the versioned default a project ships with, and every value an
 * `admin` changes from this screen is a *partial* overlay stored in the
 * database (`ThemeStoreLike`), applied on top of the file at render time.
 * The file is never written by a live production instance — that half stays
 * gated behind `fileExporter`, present only in development, mirroring the
 * ADR-0010 gate `site-plan-router.ts` already applies to the content schema.
 *
 * Structurally typed against `@cogenta/render`, `@cogenta/schema` and
 * `@cogenta/plugins` rather than importing any of them — the same reason
 * `site-plan-router.ts` gives for doing the same with `@cogenta/agents`:
 * this package calls a handful of functions, and the dependency arrow
 * points one way.
 *
 * Admin only, every route: a theme is site-wide, and this changes what
 * every visitor sees.
 */

export interface ThemeTokensLike extends Record<string, unknown> {}

export interface ThemeOverridesLike {
  readonly tokenOverrides: Record<string, unknown> | null
  readonly additionalCss: string | null
  readonly logoMediaId: string | null
  readonly logoDarkMediaId: string | null
  readonly faviconMediaId: string | null
  readonly shareImageMediaId: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface SetThemeOverridesInputLike {
  readonly tokenOverrides?: Record<string, unknown> | null
  readonly additionalCss?: string | null
  readonly logoMediaId?: string | null
  readonly logoDarkMediaId?: string | null
  readonly faviconMediaId?: string | null
  readonly shareImageMediaId?: string | null
  readonly updatedBy?: string | null
}

export interface ThemeStoreLike {
  get(): Promise<ThemeOverridesLike>
  set(input: SetThemeOverridesInputLike): Promise<ThemeOverridesLike>
  clear(updatedBy: string | null): Promise<ThemeOverridesLike>
}

export interface SkinGalleryEntryLike {
  readonly id: string
  readonly displayName: string
  readonly description: string | null
  readonly submittedAt: string
  readonly tokens: Record<string, unknown> | null
}

export interface SkinGalleryLike {
  listAccepted(): Promise<readonly SkinGalleryEntryLike[]>
  get(id: string): Promise<SkinGalleryEntryLike | null>
}

export interface SkinCandidateLike {
  readonly id: string
  readonly label: string
  readonly rationale: string
  readonly tokens: Record<string, unknown>
}

export interface SkinGeneratorLike {
  generate(input: {
    readonly description: string
  }): Promise<
    | { readonly ok: true; readonly candidates: readonly SkinCandidateLike[] }
    | { readonly ok: false; readonly reason: string }
  >
}

export interface ThemeRouterOptions {
  readonly store: ThemeStoreLike
  /** Reads `theme.tokens.json` fresh — never cached across requests, so a manual edit to the file shows up too. */
  readonly loadFileTokens: () => Promise<ThemeTokensLike | null>
  /**
   * Runs the real `validateSkin` (contract D). Throws the real `CogentaError`
   * (`SKIN_TOKEN_MISSING`, `SKIN_CONTRAST_INSUFFICIENT`, …) on refusal —
   * never re-coded here, so a skin this route accepts is a skin `cogenta
   * skin validate` would accept too.
   */
  readonly validateTokens: (candidate: unknown) => ThemeTokensLike
  /** The real `mergeSkinTokens` — a partial overlay on a complete base. */
  readonly mergeTokens: (
    base: ThemeTokensLike,
    overrides: Record<string, unknown>,
  ) => ThemeTokensLike
  readonly skinGallery?: SkinGalleryLike
  /** Absent whenever no LLM provider is configured (R2) — the section disappears client-side rather than erroring. */
  readonly generator?: SkinGeneratorLike
  /**
   * Absent on any instance that may not write `theme.tokens.json` — a
   * production deployment (ADR-0010's own reasoning, applied to the theme
   * file rather than the schema file). Present only under `cogenta dev`.
   */
  readonly fileExporter?: (tokens: ThemeTokensLike) => Promise<void>
  readonly basePath?: string
}

export interface ThemeRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/theme'
const MAX_ADDITIONAL_CSS_LENGTH = 100_000

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may view or change the site theme.',
    hint: 'Ask an administrator to change the appearance of this site.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function invalidCss(reason: string): CogentaError {
  return new CogentaError({
    code: 'THEME_OVERRIDE_INVALID',
    message: `Additional CSS was refused: ${reason}`,
    hint: 'Additional CSS is served as its own stylesheet, never inlined — it must stay well under the size limit and never try to close the file it is served in.',
  })
}

function checkAdditionalCss(value: string | null | undefined): void {
  if (value === null || value === undefined) return
  if (value.length > MAX_ADDITIONAL_CSS_LENGTH) {
    throw invalidCss(`must be at most ${MAX_ADDITIONAL_CSS_LENGTH} characters`)
  }
}

function noGenerator(): CogentaError {
  return new CogentaError({
    code: 'THEME_NO_PROVIDER',
    message: 'No LLM provider is configured, so a skin cannot be generated here.',
    hint: 'Add an `llm` section to cogenta.config.mjs with a provider and a key, then restart. Everything else in this screen works without one (R2).',
  })
}

function noExporter(): CogentaError {
  return new CogentaError({
    code: 'THEME_EXPORT_NOT_ALLOWED',
    message: 'This instance cannot write theme.tokens.json.',
    hint: 'Exporting overrides to the file is available under `cogenta dev` only, the same rule ADR-0010 applies to the content schema. The overrides you saved here still apply — export just freezes them into the file for the next deploy.',
  })
}

async function effectiveTokens(
  options: ThemeRouterOptions,
  overrides: ThemeOverridesLike,
): Promise<{ readonly file: ThemeTokensLike | null; readonly effective: ThemeTokensLike | null }> {
  const file = await options.loadFileTokens()
  if (file === null) return { file: null, effective: null }
  const effective =
    overrides.tokenOverrides === null ? file : options.mergeTokens(file, overrides.tokenOverrides)
  return { file, effective }
}

function overridesPayload(overrides: ThemeOverridesLike): Record<string, unknown> {
  return {
    tokenOverrides: overrides.tokenOverrides,
    additionalCss: overrides.additionalCss,
    logoMediaId: overrides.logoMediaId,
    logoDarkMediaId: overrides.logoDarkMediaId,
    faviconMediaId: overrides.faviconMediaId,
    shareImageMediaId: overrides.shareImageMediaId,
    updatedAt: overrides.updatedAt,
    updatedBy: overrides.updatedBy,
  }
}

export function createThemeRouter(options: ThemeRouterOptions): ThemeRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Theme routes are under /api/theme.',
          })
        }
        const method = request.method.toUpperCase()
        const [first, second, third] = segments

        // GET /api/theme — everything the screen needs in one call.
        if (first === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const overrides = await options.store.get()
          const { file, effective } = await effectiveTokens(options, overrides)
          const skins =
            options.skinGallery === undefined ? [] : await options.skinGallery.listAccepted()
          return jsonResponse(200, {
            data: {
              fileTokens: file,
              effectiveTokens: effective,
              overrides: overridesPayload(overrides),
              skins: skins.map((entry) => ({
                id: entry.id,
                displayName: entry.displayName,
                description: entry.description,
                submittedAt: entry.submittedAt,
                tokens: entry.tokens,
              })),
              aiAvailable: options.generator !== undefined,
              exportAvailable: options.fileExporter !== undefined,
            },
          })
        }

        // PUT /api/theme/overrides — the token editor, identity pickers and additional CSS.
        if (first === 'overrides' && second === undefined) {
          if (method === 'DELETE') {
            const cleared = await options.store.clear(actor.id)
            return jsonResponse(200, { data: overridesPayload(cleared) })
          }
          if (method !== 'PUT') return methodNotAllowed(['PUT', 'DELETE'])
          const body = (request.body ?? {}) as SetThemeOverridesInputLike

          if (body.tokenOverrides !== undefined && body.tokenOverrides !== null) {
            // The merged result — file plus this candidate overlay — must
            // itself pass contract D. A partial overlay that looks
            // reasonable in isolation can still break contrast against a
            // base colour it did not touch, so what is validated is always
            // the whole picture, never the fragment alone.
            const file = await options.loadFileTokens()
            const base = file ?? {}
            const merged = options.mergeTokens(base, body.tokenOverrides)
            options.validateTokens(merged)
          }
          checkAdditionalCss(body.additionalCss)

          const written = await options.store.set({ ...body, updatedBy: actor.id })
          return jsonResponse(200, { data: overridesPayload(written) })
        }

        // GET /api/theme/skins — the validated-at-submission gallery (`@cogenta/plugins`, L7 task 10).
        if (first === 'skins' && second === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const skins =
            options.skinGallery === undefined ? [] : await options.skinGallery.listAccepted()
          return jsonResponse(200, { data: skins })
        }

        // POST /api/theme/skins/:id/apply — validate again (defence in depth), then overwrite the overrides wholesale.
        if (first === 'skins' && second !== undefined && third === 'apply') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (options.skinGallery === undefined) {
            throw new CogentaError({
              code: 'THEME_SKIN_NOT_FOUND',
              message: 'No skin gallery is configured on this instance.',
              hint: 'There is nothing to apply from.',
            })
          }
          const entry = await options.skinGallery.get(second)
          if (entry === null || entry.tokens === null) {
            throw new CogentaError({
              code: 'THEME_SKIN_NOT_FOUND',
              message: `No accepted skin with id "${second}".`,
              hint: 'Only skins the gallery has accepted (passed contract D) can be applied.',
            })
          }
          const validated = options.validateTokens(entry.tokens)
          const file = await options.loadFileTokens()
          // Applying a gallery skin replaces the *whole* token overlay
          // (every group), not a partial patch — the point of picking a
          // whole skin is that it is internally consistent (its own
          // contrast pairs were validated together). Diffed against the
          // file so `set()` still only stores what actually differs.
          const overlay = file === null ? validated : diffTokens(file, validated)
          const written = await options.store.set({ tokenOverrides: overlay, updatedBy: actor.id })
          return jsonResponse(200, { data: overridesPayload(written) })
        }

        // POST /api/theme/generate — AI candidates (R2/R6/R8, fiche 14 task 3 / L19).
        if (first === 'generate' && second === undefined) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (options.generator === undefined) throw noGenerator()
          const description = (request.body as { description?: unknown } | undefined)?.description
          if (typeof description !== 'string' || description.trim() === '') {
            throw new CogentaError({
              code: 'CONTENT_INVALID',
              message: 'A description is required to generate a skin.',
              hint: 'Send { "description": "warm, editorial, paper-like" }.',
            })
          }
          const result = await options.generator.generate({ description })
          if (!result.ok) {
            throw new CogentaError({
              code: 'THEME_OVERRIDE_INVALID',
              message: `No usable skin could be generated: ${result.reason}`,
              hint: 'Try a different description, or apply a skin from the gallery instead.',
            })
          }
          // R6: candidates are returned, never applied. The client calls
          // PUT /api/theme/overrides with the chosen one's tokens.
          return jsonResponse(200, { data: { candidates: result.candidates } })
        }

        // POST /api/theme/export — freezes the current effective tokens into theme.tokens.json. Development only.
        if (first === 'export' && second === undefined) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (options.fileExporter === undefined) throw noExporter()
          const overrides = await options.store.get()
          const { effective } = await effectiveTokens(options, overrides)
          if (effective === null) {
            throw new CogentaError({
              code: 'CONTENT_NOT_FOUND',
              message: 'There is no theme.tokens.json to export to yet.',
              hint: 'Run `cogenta skin apply` once to create the file, then overrides can be exported into it.',
            })
          }
          await options.fileExporter(effective)
          return jsonResponse(200, { data: { exported: true } })
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'Theme routes are /api/theme, /api/theme/overrides, /api/theme/skins, /api/theme/generate and /api/theme/export.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

/** Only the leaves that actually differ from `base` — what `set()` should store as the overlay, so a file default an applied skin happens to agree with is never re-persisted. */
function diffTokens(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [group, value] of Object.entries(candidate)) {
    const baseGroup = base[group]
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof baseGroup !== 'object' ||
      baseGroup === null
    ) {
      out[group] = value
      continue
    }
    const changed: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if ((baseGroup as Record<string, unknown>)[key] !== v) changed[key] = v
    }
    if (Object.keys(changed).length > 0) out[group] = changed
  }
  return out
}
