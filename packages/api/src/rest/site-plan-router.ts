import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/site-plans` — L19 tasks 5 and 7: the same document-driven planning
 * the installer offers, on a site that is already alive.
 *
 * Structurally typed against `@cogenta/agents` rather than importing it, for
 * the reason `agents-router.ts` gives for the same choice: the dependency
 * arrow between these two packages points one way, and this router calls
 * four methods.
 *
 * Three rules are enforced here and not left to the UI above:
 *
 * 1. **Nothing is applied without a complete review.** `apply` calls
 *    `resolveApprovedPlan`, which refuses a plan with an undecided item —
 *    the API has no "accept everything" parameter, deliberately.
 * 2. **Applying is additive.** An `applier` is told to add collections; a
 *    proposal that would redefine one this site already has is refused by
 *    the applier and reported, never merged over the top of live content.
 * 3. **A plan is applied at most once.** A second `apply` on the same draft
 *    is a conflict, not a repeat.
 *
 * Admin only, every route. A plan changes the shape of the site.
 */

export interface PlanItemLike {
  readonly id: string
  readonly section: string
  readonly title: string
  readonly detail: string
}

export interface PlanSectionLike {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly mode: 'each' | 'one-of'
  readonly items: readonly PlanItemLike[]
}

export type PlanDecisionsLike = Readonly<Record<string, 'accepted' | 'rejected'>>

export interface SitePlanDraftLike {
  readonly id: string
  readonly createdAt: string
  readonly brief: {
    readonly activity: string
    readonly summary: string
    readonly languages: readonly string[]
    readonly warnings: readonly string[]
    readonly sources: readonly { readonly filename: string }[]
  }
  readonly violations: readonly { readonly explanation: string }[]
  readonly warnings: readonly string[]
}

export interface StoredSitePlanLike {
  readonly draft: SitePlanDraftLike
  readonly decisions: PlanDecisionsLike
  readonly appliedAt?: string
}

export interface SitePlanStoreLike {
  save(draft: SitePlanDraftLike): Promise<StoredSitePlanLike>
  get(id: string): Promise<StoredSitePlanLike>
  list(): Promise<readonly StoredSitePlanLike[]>
  recordDecisions(id: string, decisions: PlanDecisionsLike): Promise<StoredSitePlanLike>
  markApplied(id: string, at: string): Promise<StoredSitePlanLike>
  delete(id: string): Promise<void>
}

export interface UploadedDocument {
  readonly filename: string
  readonly contentBase64: string
}

/**
 * Reads and plans. Both halves are one interface because the router never
 * wants one without the other — and because keeping the extraction on the
 * far side of it means this package never has to know what a PDF is.
 */
export interface SitePlannerLike {
  propose(input: {
    readonly documents: readonly UploadedDocument[]
    readonly siteName?: string
  }): Promise<
    | { readonly ok: true; readonly draft: SitePlanDraftLike }
    | { readonly ok: false; readonly stage: string; readonly reason: string }
  >
  /** The draft, flattened into the units a human decides on. */
  sections(draft: SitePlanDraftLike): readonly PlanSectionLike[]
}

export interface AppliedPlanReport {
  /** Collections actually created. */
  readonly added: readonly string[]
  /** Proposals refused because the site already has a collection of that name. */
  readonly skipped: readonly { readonly name: string; readonly reason: string }[]
  readonly entriesSeeded: number
  readonly skinApplied: boolean
  /** What the operator still has to do by hand — a restart, most often. Never claimed to be automatic. */
  readonly followUp: readonly string[]
}

export interface SitePlanApplierLike {
  apply(input: {
    readonly draft: SitePlanDraftLike
    readonly decisions: PlanDecisionsLike
    readonly actorId: string | null
  }): Promise<AppliedPlanReport>
}

export interface SitePlanRouterOptions {
  readonly store: SitePlanStoreLike
  /**
   * Absent when no LLM provider is configured. Every route that needs one
   * then answers `SITE_PLAN_NO_PROVIDER` with a hint, rather than 500 —
   * R2: a piece not configured is a clear "not available here", never a
   * failure and never a broken screen.
   */
  readonly planner?: SitePlannerLike
  /** Absent on a read-only instance: plans can still be proposed and reviewed, but not applied. */
  readonly applier?: SitePlanApplierLike
  readonly basePath?: string
  readonly now?: () => Date
  /** How many documents one request may carry. */
  readonly maxDocuments?: number
}

export interface SitePlanRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/site-plans'
const DEFAULT_MAX_DOCUMENTS = 5

/**
 * Base64 grows bytes by a third, so this is the encoded form of the 20 MiB
 * `extractDocumentText` accepts. Checked here, on the string, **before**
 * anything decodes it: the far side's own limit only fires after a Buffer
 * that size has already been allocated, and this is the one route in the
 * API that invites megabyte bodies by design.
 */
const MAX_BASE64_PER_DOCUMENT = 28 * 1024 * 1024
const MAX_BASE64_TOTAL = 60 * 1024 * 1024

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may propose or apply a site plan.',
    hint: 'A site plan changes the shape of the site. Ask an administrator.',
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

function noPlanner(): CogentaError {
  return new CogentaError({
    code: 'SITE_PLAN_NO_PROVIDER',
    message: 'No LLM provider is configured, so a document cannot be analysed here.',
    hint: 'Add an `llm` section to cogenta.config.mjs with a provider and a key, then restart. Everything else in this admin works without one.',
  })
}

function requireDocuments(body: unknown, max: number): readonly UploadedDocument[] {
  const documents = (body as { documents?: unknown } | undefined)?.documents
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'This request carries no document.',
      hint: 'Send { "documents": [{ "filename": "brief.pdf", "contentBase64": "…" }] }.',
    })
  }
  if (documents.length > max) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `This request carries ${documents.length} documents, over the limit of ${max}.`,
      hint: `Upload at most ${max} at a time.`,
    })
  }
  let total = 0
  return documents.map((entry, index) => {
    const document = entry as { filename?: unknown; contentBase64?: unknown }
    if (typeof document.filename !== 'string' || document.filename === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `Document ${index} has no filename.`,
        hint: 'Every document needs a filename — it is how the plan says where a constraint came from.',
      })
    }
    if (typeof document.contentBase64 !== 'string' || document.contentBase64 === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `Document "${document.filename}" carries no content.`,
        hint: 'Send the file base64-encoded in `contentBase64`.',
      })
    }
    if (document.contentBase64.length > MAX_BASE64_PER_DOCUMENT) {
      throw new CogentaError({
        code: 'DOCUMENT_TOO_LARGE',
        message: `"${document.filename}" is larger than this route accepts.`,
        hint: 'Upload a document of 20 MB or less, or paste the sections that describe the site as plain text.',
        details: { filename: document.filename },
      })
    }
    total += document.contentBase64.length
    if (total > MAX_BASE64_TOTAL) {
      throw new CogentaError({
        code: 'DOCUMENT_TOO_LARGE',
        message: 'These documents are larger, together, than this route accepts.',
        hint: 'Upload them in smaller batches.',
      })
    }
    return { filename: document.filename, contentBase64: document.contentBase64 }
  })
}

function requireDecisions(body: unknown): PlanDecisionsLike {
  const decisions = (body as { decisions?: unknown } | undefined)?.decisions
  if (typeof decisions !== 'object' || decisions === null || Array.isArray(decisions)) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'This request carries no decisions.',
      hint: 'Send { "decisions": { "contentModel:dish": "accepted" } } — one entry per item you have judged.',
    })
  }
  const out: Record<string, 'accepted' | 'rejected'> = {}
  for (const [id, value] of Object.entries(decisions as Record<string, unknown>)) {
    if (value !== 'accepted' && value !== 'rejected') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `The decision for "${id}" is "${String(value)}".`,
        hint: 'A decision is "accepted" or "rejected". There is no third value, and no blanket one.',
      })
    }
    out[id] = value
  }
  return out
}

function summaryOf(stored: StoredSitePlanLike): Record<string, unknown> {
  return {
    id: stored.draft.id,
    createdAt: stored.draft.createdAt,
    activity: stored.draft.brief.activity,
    summary: stored.draft.brief.summary,
    sources: stored.draft.brief.sources.map((source) => source.filename),
    decidedCount: Object.keys(stored.decisions).length,
    appliedAt: stored.appliedAt,
  }
}

export function createSitePlanRouter(options: SitePlanRouterOptions): SitePlanRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const now = options.now ?? ((): Date => new Date())
  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Site plan routes are /api/site-plans and /api/site-plans/:id.',
          })
        }
        const method = request.method.toUpperCase()
        const [id, action, extra] = segments

        if (id === undefined) {
          // GET /api/site-plans
          if (method === 'GET') {
            const data = (await options.store.list()).map(summaryOf)
            return jsonResponse(200, {
              data,
              // Said out loud rather than inferred from an empty list: a
              // screen that cannot explain why it is empty is a screen
              // people file bugs against.
              plannerAvailable: options.planner !== undefined,
            })
          }
          // POST /api/site-plans — read the documents and propose.
          if (method === 'POST') {
            if (options.planner === undefined) throw noPlanner()
            const documents = requireDocuments(request.body, maxDocuments)
            const siteName = (request.body as { siteName?: unknown } | undefined)?.siteName
            const proposed = await options.planner.propose({
              documents,
              ...(typeof siteName === 'string' && siteName !== '' ? { siteName } : {}),
            })
            if (!proposed.ok) {
              throw new CogentaError({
                code: 'SITE_BRIEF_GENERATION_FAILED',
                message: `The document could not be turned into a plan (${proposed.stage}): ${proposed.reason}`,
                hint: 'Check that the document really describes a website, and that the configured model is reachable.',
              })
            }
            const stored = await options.store.save(proposed.draft)
            return jsonResponse(201, {
              data: {
                ...summaryOf(stored),
                draft: stored.draft,
                sections: options.planner.sections(stored.draft),
                decisions: stored.decisions,
              },
            })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        // GET /api/site-plans/:id
        if (action === undefined) {
          if (method === 'DELETE') {
            await options.store.delete(id)
            return jsonResponse(200, { data: { id, deleted: true } })
          }
          if (method !== 'GET') return methodNotAllowed(['GET', 'DELETE'])
          const stored = await options.store.get(id)
          return jsonResponse(200, {
            data: {
              ...summaryOf(stored),
              draft: stored.draft,
              sections: options.planner?.sections(stored.draft) ?? [],
              decisions: stored.decisions,
            },
          })
        }

        if (extra !== undefined) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Site plan routes are /api/site-plans/:id/decisions and /api/site-plans/:id/apply.',
          })
        }

        // POST /api/site-plans/:id/decisions
        if (action === 'decisions') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const decisions = requireDecisions(request.body)
          await options.store.get(id)
          const stored = await options.store.recordDecisions(id, decisions)
          return jsonResponse(200, { data: { id, decisions: stored.decisions } })
        }

        // POST /api/site-plans/:id/apply
        if (action === 'apply') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (options.applier === undefined) {
            throw new CogentaError({
              code: 'CONTENT_READ_ONLY',
              message: 'This instance cannot apply a site plan.',
              hint: 'It is running read-only. Review the plan here, and apply it from an instance that can write.',
            })
          }
          const stored = await options.store.get(id)
          if (stored.appliedAt !== undefined) {
            throw new CogentaError({
              code: 'CONTENT_CONFLICT',
              message: `This plan was already applied on ${stored.appliedAt}.`,
              hint: 'Upload the document again to propose a fresh plan — a plan is applied at most once.',
            })
          }
          // `apply` resolves the decisions itself, and refuses an undecided
          // item. There is no parameter here that could skip that.
          const report = await options.applier.apply({
            draft: stored.draft,
            decisions: stored.decisions,
            actorId: actor.id,
          })
          const applied = await options.store.markApplied(id, now().toISOString())
          return jsonResponse(200, { data: { ...summaryOf(applied), report } })
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'Site plan routes are /api/site-plans/:id/decisions and /api/site-plans/:id/apply.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
