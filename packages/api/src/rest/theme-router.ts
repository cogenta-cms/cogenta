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
  readonly activeTheme: string | null
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
  readonly activeTheme?: string | null
  readonly updatedBy?: string | null
}

/** One entry of the theme picker (fiche L23, fields extended fiche 48) — a package name and what an admin sees for it. */
export interface AvailableThemeLike {
  /** The package name a site's `activeTheme` overlay names, e.g. `@cogenta/theme-portfolio`. */
  readonly name: string
  readonly label: string
  readonly description: string
  /** `ThemeManifest.version` (contract D) — the theme contract's own version, distinct from the npm package version. */
  readonly version: string
  /** `ThemeManifest.author`, or `null` for a theme that does not declare one. */
  readonly author: string | null
  /** `true` for a real folder under `themes/` this project owns and can delete; `false` for an npm-packaged built-in. Additive — decides whether the appearance gallery offers "Supprimer" on a card. */
  readonly local: boolean
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
  readonly kind: 'tokens'
  readonly id: string
  readonly label: string
  readonly rationale: string
  readonly tokens: Record<string, unknown>
  /**
   * The base theme package this candidate is paired with (L26 task 5,
   * Theme Creator) — absent for a plain skin-only candidate, exactly what
   * every caller before this lot produced. Present whenever `generate()`
   * was asked to choose a theme as well as a palette.
   */
  readonly themeName?: string
  readonly chromeInput?: { readonly tagline?: string; readonly footerNote?: string }
}

/**
 * Fiche 73 follow-up — the other real shape `generate()` can now return: a
 * fully custom page layout, written by a real tool-calling agent run into
 * one sandbox directory (`@cogenta/agents-builtin`'s `generateSandboxTheme`)
 * rather than contract D tokens overlaid on an already-installed theme.
 * Never applied by this route either — same R6 posture as `SkinCandidateLike`
 * — the client previews it (`GET /api/theme/sandbox/:id/preview`, already
 * existing) and, to activate it, calls the already-existing sandbox deploy
 * pipeline (`POST /api/theme/sandbox/:id/deploy` then `PUT
 * /api/theme/overrides`), never a new write path invented here.
 */
export interface SandboxCandidateLike {
  readonly kind: 'sandbox'
  readonly id: string
  readonly label: string
  readonly rationale: string
  readonly sandboxId: string
  readonly filesWritten: readonly string[]
}

export type ThemeGenerateCandidateLike = SkinCandidateLike | SandboxCandidateLike

/**
 * One file the client attached to a `generate()` request — never applied on
 * its own, only read for context (L26 task 5). `data` is already decoded:
 * the wire body carries base64 (`contentBase64`, the same convention every
 * upload route in this package uses), and this router decodes it once,
 * right here, the same place `assistant-router.ts` decodes its own
 * reference-document upload — `options.generator` never sees base64.
 */
export interface ThemeGenerateAttachmentLike {
  readonly filename: string
  readonly mimeType: string
  readonly data: Uint8Array
}

export interface SkinGeneratorLike {
  /**
   * Whether a provider is actually resolvable *right now* — checked fresh on
   * every call, never cached, because the admin-configurable provider store
   * this wraps (`theme-wiring.ts`'s `resolveThemeProvider`) can gain a
   * provider well after this router was built at `cogenta serve` boot.
   * `generator`'s mere presence on `ThemeRouterOptions` only means this
   * instance has *an avenue* to a provider (a `providerStore` or a static
   * `config.llm`); this is the live answer to "is one actually configured".
   */
  isAvailable(): Promise<boolean>
  generate(
    input: {
      readonly description: string
      /** Absent for every caller that predates L26 task 5 — behaviour then is byte-identical to before. */
      readonly attachments?: readonly ThemeGenerateAttachmentLike[]
      /** Present for "adjust the current theme" rather than "design a new one". */
      readonly baseline?: { readonly themeName: string }
    },
    /** Fiche feedback — present only when the job-based `…/generate/jobs` route calls this; the synchronous `POST …/generate` above omits it, so behaviour there is unchanged. */
    onProgress?: ThemeGenerateProgressReporter,
  ): Promise<
    | {
        readonly ok: true
        readonly candidates: readonly ThemeGenerateCandidateLike[]
        readonly warnings?: readonly string[]
      }
    | { readonly ok: false; readonly reason: string }
  >
  /**
   * The second turn and every one after it: the operator has seen the theme
   * and is asking for a change to it.
   *
   * Separate from `generate` rather than another optional field on it,
   * because the two produce genuinely different runs — a refinement reads the
   * theme that already exists and changes only what was named, where a
   * generation analyses a brief and writes from nothing. Folding them
   * together would mean one prompt trying to be both, which is how "make it
   * darker" turns into a rewritten theme.
   *
   * Optional so an instance that cannot refine (no sandbox, no filesystem)
   * simply does not offer it, the same way `generator` itself is optional.
   */
  refine?(
    input: {
      /** The sandbox holding the theme to change, for a custom-layout candidate. */
      readonly sandboxId?: string
      /**
       * The token candidate being adjusted, for the other shape.
       *
       * Every turn after the first has to continue from what exists — a
       * follow-up that re-derives the theme from the brief answers with a
       * *different* theme each time, which is the opposite of a
       * conversation. A token candidate has no sandbox to re-read, so what
       * it continues from is its own current token values.
       */
      readonly baseline?: {
        readonly themeName?: string
        readonly tokens: Record<string, unknown>
      }
      /** What to change, in the operator's own words. */
      readonly message: string
      readonly attachments?: readonly ThemeGenerateAttachmentLike[]
      /** Oldest first — so a follow-up like "un peu moins" has something to refer to. */
      readonly previousTurns?: readonly {
        readonly role: 'user' | 'agent'
        readonly message: string
      }[]
    },
    onProgress?: ThemeGenerateProgressReporter,
  ): Promise<
    | {
        readonly ok: true
        readonly candidates: readonly ThemeGenerateCandidateLike[]
        readonly warnings?: readonly string[]
      }
    | { readonly ok: false; readonly reason: string }
  >
}

/** Structural, matching `@cogenta/agents`' `ProgressReporter` — see `agents-router.ts`'s own `AgentRunProgressReporter` for the identical reasoning. */
export interface ThemeGenerateProgressReporter {
  report(message: string, detail?: { readonly kind?: string; readonly tool?: string }): void
}

export interface ThemeGenerateProgressEvent {
  readonly at: number
  readonly message: string
  /** What the line is, as classified by the runtime that produced it — absent on a job started before structured events existed. */
  readonly kind?: string
  readonly tool?: string
}

/**
 * Fiche feedback — "je ne sais pas si le traitement est en cours ou pas",
 * for the theme generator screen specifically: several design directions
 * run in parallel, each with its own retry loop, and `POST …/generate`
 * gave no sign of any of that until the whole call finished. Same
 * "plain value in, plain value out stays untouched, a job is additive"
 * shape as `agents-router.ts`'s own job routes.
 */
export interface ThemeGenerateJob {
  readonly status: 'running' | 'done' | 'failed'
  readonly events: readonly ThemeGenerateProgressEvent[]
  readonly result?: unknown
  readonly error?: { readonly message: string }
}

export interface ThemeGenerateJobStoreLike {
  start(run: (reporter: ThemeGenerateProgressReporter) => Promise<unknown>): string
  get(id: string): ThemeGenerateJob | undefined
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
  /**
   * The theme packages this instance can actually resolve — always present,
   * never empty: even an install with no LLM provider and no gallery entry
   * can still switch its layout theme (R2). `GET /api/theme` echoes this list
   * so the picker never hardcodes theme names of its own, and `PUT
   * /api/theme/overrides` refuses an `activeTheme` that is not one of them.
   *
   * A function, called fresh on every request, not a snapshot resolved once
   * at wiring time — fiche 73's own live E2E test found a theme deployed
   * (or a `themes/` folder dropped in by hand) *after* `cogenta serve` had
   * already booted was invisible here forever, no matter how many times the
   * gallery was reloaded, because the array used to be computed once and
   * captured in this options object at boot. `theme-registry.ts`'s own
   * per-name cache already re-resolves correctly mid-process (fixed
   * alongside this); this was the second, separate half of the same "no
   * restart needed" promise the appearance screen already makes for tokens.
   */
  readonly availableThemes: () => Promise<readonly AvailableThemeLike[]>
  /** Fiche feedback — backs `POST/GET …/generate/jobs`. Omitted means those two routes answer `THEME_NO_PROVIDER`-shaped unavailability like `generate` itself does when there's no generator; the synchronous `POST …/generate` route is unaffected either way. */
  readonly progressJobs?: ThemeGenerateJobStoreLike
  readonly basePath?: string
}

export interface ThemeRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/theme'
const MAX_ADDITIONAL_CSS_LENGTH = 100_000
/** Base64 grows bytes by roughly a third — checked on the encoded string, before anything decodes it, same guard `assistant-router.ts`/`site-plan-router.ts` use for the same reason. */
const MAX_BASE64_PER_ATTACHMENT = 28 * 1024 * 1024
const MAX_BASE64_TOTAL = 60 * 1024 * 1024
const MAX_ATTACHMENTS = 5

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

/**
 * L26 task 5 — Theme Creator's attachments. Absent (`undefined` in the
 * body) is the byte-identical path every caller before this lot took: no
 * key, no validation, no change to `options.generator.generate()`'s call.
 * Present, each entry is decoded here — `Buffer.from(contentBase64,
 * 'base64')` then `new Uint8Array(...)` — the same place
 * `assistant-router.ts` decodes its own upload, so `options.generator`
 * never has to know what base64 is.
 */
function requireAttachments(value: unknown): readonly ThemeGenerateAttachmentLike[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'attachments must be an array.',
      hint: 'Send { "attachments": [{ "filename": "brief.pdf", "mimeType": "application/pdf", "contentBase64": "…" }] }.',
    })
  }
  if (value.length > MAX_ATTACHMENTS) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `This request carries ${value.length} attachments, over the limit of ${MAX_ATTACHMENTS}.`,
      hint: `Attach at most ${MAX_ATTACHMENTS} files at a time.`,
    })
  }
  let total = 0
  return value.map((entry, index) => {
    const attachment = entry as { filename?: unknown; mimeType?: unknown; contentBase64?: unknown }
    if (typeof attachment.filename !== 'string' || attachment.filename === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `Attachment ${index} has no filename.`,
        hint: 'Every attachment needs a filename.',
      })
    }
    if (typeof attachment.mimeType !== 'string' || attachment.mimeType === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `Attachment "${attachment.filename}" has no mimeType.`,
        hint: 'Send the browser-reported MIME type, e.g. "application/pdf" or "image/png".',
      })
    }
    if (typeof attachment.contentBase64 !== 'string' || attachment.contentBase64 === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `Attachment "${attachment.filename}" carries no content.`,
        hint: 'Send the file base64-encoded in `contentBase64`.',
      })
    }
    if (attachment.contentBase64.length > MAX_BASE64_PER_ATTACHMENT) {
      throw new CogentaError({
        code: 'DOCUMENT_TOO_LARGE',
        message: `"${attachment.filename}" is larger than this route accepts.`,
        hint: 'Attach a file of 20 MB or less.',
        details: { filename: attachment.filename },
      })
    }
    total += attachment.contentBase64.length
    if (total > MAX_BASE64_TOTAL) {
      throw new CogentaError({
        code: 'DOCUMENT_TOO_LARGE',
        message: 'These attachments are larger, together, than this route accepts.',
        hint: 'Attach fewer files, or smaller ones.',
      })
    }
    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      data: new Uint8Array(Buffer.from(attachment.contentBase64, 'base64')),
    }
  })
}

function requireBaseline(value: unknown): { readonly themeName: string } | undefined {
  if (value === undefined) return undefined
  const baseline = value as { themeName?: unknown }
  if (typeof baseline.themeName !== 'string' || baseline.themeName === '') {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'baseline.themeName is required when baseline is sent.',
      hint: 'Send { "baseline": { "themeName": "@cogenta/theme-canonical" } }, or omit `baseline` entirely to design a new theme rather than adjust the current one.',
    })
  }
  return { themeName: baseline.themeName }
}

/** Shared between `POST /api/theme/generate` and its job-based twin — one parse, so the two can never validate a request body differently. */
function parseGenerateBody(body: unknown): {
  readonly description: string
  readonly attachments?: readonly ThemeGenerateAttachmentLike[]
  readonly baseline?: { readonly themeName: string }
} {
  const parsed = body as
    | { description?: unknown; attachments?: unknown; baseline?: unknown }
    | undefined
  const description = parsed?.description
  if (typeof description !== 'string' || description.trim() === '') {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'A description is required to generate a skin.',
      hint: 'Send { "description": "warm, editorial, paper-like" }.',
    })
  }
  const attachments = requireAttachments(parsed?.attachments)
  const baseline = requireBaseline(parsed?.baseline)
  return {
    description,
    ...(attachments === undefined ? {} : { attachments }),
    ...(baseline === undefined ? {} : { baseline }),
  }
}

function parseRefineBody(body: unknown): {
  readonly sandboxId?: string
  readonly baseline?: { readonly themeName?: string; readonly tokens: Record<string, unknown> }
  readonly message: string
  readonly attachments?: readonly ThemeGenerateAttachmentLike[]
  readonly previousTurns?: readonly { readonly role: 'user' | 'agent'; readonly message: string }[]
} {
  const parsed = body as
    | {
        sandboxId?: unknown
        baseline?: unknown
        message?: unknown
        attachments?: unknown
        previousTurns?: unknown
      }
    | undefined

  const rawSandboxId = parsed?.sandboxId
  const sandboxId =
    typeof rawSandboxId === 'string' && rawSandboxId.trim() !== '' ? rawSandboxId : undefined

  const rawBaseline = parsed?.baseline as
    | { themeName?: unknown; tokens?: unknown }
    | null
    | undefined
  const baselineTokens =
    typeof rawBaseline?.tokens === 'object' && rawBaseline.tokens !== null
      ? (rawBaseline.tokens as Record<string, unknown>)
      : undefined
  const baseline =
    baselineTokens === undefined
      ? undefined
      : {
          tokens: baselineTokens,
          ...(typeof rawBaseline?.themeName === 'string'
            ? { themeName: rawBaseline.themeName }
            : {}),
        }

  // One or the other, never neither: without something to continue from,
  // this would be a fresh generation wearing a refinement's name — and
  // answering a follow-up with an unrelated theme is the exact failure this
  // route exists to prevent.
  if (sandboxId === undefined && baseline === undefined) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'Adjusting a theme needs the theme being adjusted.',
      hint: 'Send either { "sandboxId": "ai-theme-…" } for a custom layout, or { "baseline": { "tokens": … } } for a token candidate — plus the "message" describing the change.',
    })
  }

  const message = parsed?.message
  if (typeof message !== 'string' || message.trim() === '') {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'A message is required — there is nothing to change without one.',
      hint: 'Send { "sandboxId": "ai-theme-…", "message": "rends-le plus sombre" }.',
    })
  }

  const attachments = requireAttachments(parsed?.attachments)

  // Anything that is not a well-formed turn is dropped rather than refused:
  // a malformed history is a degraded conversation, not a reason to refuse a
  // change the operator is entitled to make.
  const previousTurns: readonly { readonly role: 'user' | 'agent'; readonly message: string }[] =
    Array.isArray(parsed?.previousTurns)
      ? parsed.previousTurns.flatMap((entry) => {
          const turn = entry as { role?: unknown; message?: unknown }
          if (turn?.role !== 'user' && turn?.role !== 'agent') return []
          if (typeof turn.message !== 'string' || turn.message.trim() === '') return []
          const role: 'user' | 'agent' = turn.role
          return [{ role, message: turn.message }]
        })
      : []

  return {
    ...(sandboxId === undefined ? {} : { sandboxId }),
    ...(baseline === undefined ? {} : { baseline }),
    message,
    ...(attachments === undefined ? {} : { attachments }),
    ...(previousTurns.length === 0 ? {} : { previousTurns }),
  }
}

function noRefiner(): CogentaError {
  return new CogentaError({
    code: 'THEME_NO_PROVIDER',
    message: 'This instance cannot adjust a generated theme.',
    hint: 'Adjusting needs both an LLM provider and a real project directory holding the theme sandbox — `cogenta serve` inside a project provides the second.',
  })
}

function noGenerator(): CogentaError {
  return new CogentaError({
    code: 'THEME_NO_PROVIDER',
    message: 'No LLM provider is configured, so a skin cannot be generated here.',
    hint: 'Configure a provider from Réglages → Fournisseurs (or add an `llm` section to cogenta.config.mjs and restart). Everything else in this screen works without one (R2).',
  })
}

function jobUnknown(): CogentaError {
  return new CogentaError({
    code: 'THEME_GENERATE_JOB_UNKNOWN',
    message: 'No job with this id is known.',
    hint: 'Jobs are kept for a few minutes after they finish — start a new one if this one is gone.',
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
    activeTheme: overrides.activeTheme,
    updatedAt: overrides.updatedAt,
    updatedBy: overrides.updatedBy,
  }
}

function unknownTheme(name: string, available: readonly AvailableThemeLike[]): CogentaError {
  return new CogentaError({
    code: 'THEME_NOT_FOUND',
    message: `No theme named "${name}" is available on this instance.`,
    hint: `Available: ${available.map((theme) => theme.name).join(', ')}.`,
    details: { name, available: available.map((theme) => theme.name) },
  })
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
              aiAvailable:
                options.generator === undefined ? false : await options.generator.isAvailable(),
              exportAvailable: options.fileExporter !== undefined,
              availableThemes: await options.availableThemes(),
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
          if (body.activeTheme !== undefined && body.activeTheme !== null) {
            const available = await options.availableThemes()
            if (!available.some((theme) => theme.name === body.activeTheme)) {
              throw unknownTheme(body.activeTheme, available)
            }
          }

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

        // POST /api/theme/generate — AI candidates (R2/R6/R8, fiche 14 task 3 / L19 / L26 task 5).
        if (first === 'generate' && second === undefined) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (options.generator === undefined) throw noGenerator()
          if (!(await options.generator.isAvailable())) throw noGenerator()
          const generateInput = parseGenerateBody(request.body)
          const result = await options.generator.generate(generateInput)
          if (!result.ok) {
            throw new CogentaError({
              code: 'THEME_OVERRIDE_INVALID',
              message: `No usable skin could be generated: ${result.reason}`,
              hint: 'Try a different description, or apply a skin from the gallery instead.',
            })
          }
          // R6: candidates are returned, never applied. The client calls
          // PUT /api/theme/overrides with the chosen one's tokens.
          return jsonResponse(200, {
            data: {
              candidates: result.candidates,
              ...(result.warnings === undefined || result.warnings.length === 0
                ? {}
                : { warnings: result.warnings }),
            },
          })
        }

        // POST /api/theme/generate/jobs / GET …/generate/jobs/:jobId — fiche
        // feedback: the same call above, started as a watchable job instead
        // of awaited in one request ("je ne sais pas si le traitement est
        // en cours ou pas"). `POST …/generate` itself is untouched.
        if (first === 'generate' && second === 'jobs') {
          if (third === undefined) {
            if (method !== 'POST') return methodNotAllowed(['POST'])
            if (options.generator === undefined) throw noGenerator()
            if (!(await options.generator.isAvailable())) throw noGenerator()
            if (options.progressJobs === undefined) throw noGenerator()
            const generateInput = parseGenerateBody(request.body)
            const generator = options.generator
            const id = options.progressJobs.start(async (reporter) => {
              const result = await generator.generate(generateInput, reporter)
              if (!result.ok) {
                throw new CogentaError({
                  code: 'THEME_OVERRIDE_INVALID',
                  message: `No usable skin could be generated: ${result.reason}`,
                  hint: 'Try a different description, or apply a skin from the gallery instead.',
                })
              }
              return {
                candidates: result.candidates,
                ...(result.warnings === undefined || result.warnings.length === 0
                  ? {}
                  : { warnings: result.warnings }),
              }
            })
            return jsonResponse(202, { data: { jobId: id } })
          }
          if (method !== 'GET') return methodNotAllowed(['GET'])
          if (options.progressJobs === undefined) throw noGenerator()
          const job = options.progressJobs.get(third)
          if (job === undefined) throw jobUnknown()
          return jsonResponse(200, { data: job })
        }

        // POST /api/theme/refine/jobs — the conversation's second turn and
        // every one after it. A job, never a synchronous call: adjusting runs
        // a real agent loop, and the screen showing it is a discussion whose
        // whole point is watching the work happen. Deliberately pollable
        // through `…/generate/jobs/:id` above rather than through a route of
        // its own — one job store, one polling loop, and a conversation that
        // does not care which kind of turn it is waiting on.
        if (first === 'refine' && second === 'jobs' && third === undefined) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const refine = options.generator?.refine
          const generator = options.generator
          if (generator === undefined || refine === undefined) throw noRefiner()
          if (!(await generator.isAvailable())) throw noGenerator()
          if (options.progressJobs === undefined) throw noRefiner()
          const refineInput = parseRefineBody(request.body)
          const id = options.progressJobs.start(async (reporter) => {
            const result = await refine.call(generator, refineInput, reporter)
            if (!result.ok) {
              throw new CogentaError({
                code: 'THEME_OVERRIDE_INVALID',
                message: `The theme could not be adjusted: ${result.reason}`,
                hint: 'Try describing the change differently, or start a new theme.',
              })
            }
            return {
              candidates: result.candidates,
              ...(result.warnings === undefined || result.warnings.length === 0
                ? {}
                : { warnings: result.warnings }),
            }
          })
          return jsonResponse(202, { data: { jobId: id } })
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
          hint: 'Theme routes are /api/theme, /api/theme/overrides, /api/theme/skins, /api/theme/generate, /api/theme/generate/jobs and /api/theme/export.',
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
