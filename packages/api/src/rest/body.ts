import { CogentaError } from '@cogenta/core'
import type { ContentValues, CreateInput, UpdateInput } from '@cogenta/schema'
import { CONTENT_STATUSES, PROVENANCE_KINDS } from '@cogenta/schema'
import { z } from 'zod'
import type { Actor } from '../types.js'

/**
 * Body shapes, and the line between what a caller may state and what the
 * runtime decides.
 *
 * Authorship is the important half: `createdBy`, `updatedBy` and `publishedBy`
 * are never read from the body. They come from the actor the transport
 * resolved, so a caller cannot sign an edit as somebody else. `provenance` *is*
 * accepted, because contract A means it as a declaration ("an agent wrote
 * this"), and refusing it would leave agent-written content indistinguishable
 * from human-written content.
 */

const blockSchema = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
})

const zonesSchema = z.record(z.string(), z.array(blockSchema))
const valuesSchema = z.record(z.string(), z.unknown())

const provenanceDetailSchema = z.object({
  agent: z.string().optional(),
  model: z.string().optional(),
  at: z.string().optional(),
  prompt: z.string().optional(),
})

const createSchema = z.object({
  id: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  translationOf: z.string().min(1).nullable().optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  values: valuesSchema.optional(),
  blocks: zonesSchema.optional(),
  provenance: z.enum(PROVENANCE_KINDS).optional(),
  provenanceDetail: provenanceDetailSchema.nullable().optional(),
})

const updateSchema = z.object({
  values: valuesSchema.optional(),
  blocks: zonesSchema.optional(),
  provenance: z.enum(PROVENANCE_KINDS).optional(),
  provenanceDetail: provenanceDetailSchema.nullable().optional(),
  /** Optimistic concurrency by detection (fiche 02 task 7) — see `UpdateInput.expectedUpdatedAt`. */
  expectedUpdatedAt: z.string().min(1).optional(),
})

const restoreSchema = z.object({ version: z.number().int().min(1) })

const unpublishSchema = z.object({
  status: z.enum(['draft', 'archived', 'scheduled']).optional(),
  /** Required, and only meaningful, when `status` is `'scheduled'`. */
  publishedAt: z.string().min(1).optional(),
})

const duplicateSchema = z.object({ values: valuesSchema.optional() })

const submitSchema = z.object({ reviewerId: z.string().min(1).nullable().optional() })

const assignReviewerSchema = z.object({ reviewerId: z.string().min(1).nullable() })

export function parseCreateBody(body: unknown, actor: Actor): CreateInput {
  const parsed = decode(createSchema, body)

  return {
    values: parsed.values ?? {},
    createdBy: actor.id,
    ...(parsed.id === undefined ? {} : { id: parsed.id }),
    ...(parsed.locale === undefined ? {} : { locale: parsed.locale }),
    ...(parsed.translationOf === undefined ? {} : { translationOf: parsed.translationOf }),
    ...(parsed.status === undefined ? {} : { status: parsed.status }),
    ...(parsed.blocks === undefined ? {} : { blocks: parsed.blocks }),
    ...(parsed.provenance === undefined ? {} : { provenance: parsed.provenance }),
    ...(parsed.provenanceDetail === undefined
      ? {}
      : { provenanceDetail: compact(parsed.provenanceDetail) }),
  }
}

export function parseUpdateBody(body: unknown, actor: Actor): UpdateInput {
  const parsed = decode(updateSchema, body)

  return {
    updatedBy: actor.id,
    ...(parsed.values === undefined ? {} : { values: parsed.values }),
    ...(parsed.blocks === undefined ? {} : { blocks: parsed.blocks }),
    ...(parsed.provenance === undefined ? {} : { provenance: parsed.provenance }),
    ...(parsed.provenanceDetail === undefined
      ? {}
      : { provenanceDetail: compact(parsed.provenanceDetail) }),
    ...(parsed.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: parsed.expectedUpdatedAt }),
  }
}

export function parseRestoreBody(body: unknown): number {
  return decode(restoreSchema, body).version
}

export function parseUnpublishBody(body: unknown): {
  readonly status?: 'draft' | 'archived' | 'scheduled'
  readonly publishedAt?: string
} {
  const parsed = decode(unpublishSchema, body)
  return {
    ...(parsed.status === undefined ? {} : { status: parsed.status }),
    ...(parsed.publishedAt === undefined ? {} : { publishedAt: parsed.publishedAt }),
  }
}

export function parseDuplicateBody(body: unknown): { readonly values?: ContentValues } {
  const parsed = decode(duplicateSchema, body)
  return parsed.values === undefined ? {} : { values: parsed.values }
}

/** `POST .../submit` (`schema@2.1`, ADR-0027) — a reviewer chosen at submission is optional. */
export function parseSubmitBody(body: unknown): { readonly reviewerId?: string | null } {
  const parsed = decode(submitSchema, body)
  return parsed.reviewerId === undefined ? {} : { reviewerId: parsed.reviewerId }
}

/** `POST .../assign-reviewer` — `reviewerId: null` clears the assignment. */
export function parseAssignReviewerBody(body: unknown): string | null {
  return decode(assignReviewerSchema, body).reviewerId
}

type ProvenanceDetail = NonNullable<CreateInput['provenanceDetail']>

/**
 * Drops the keys the body left out. Contract A declares them as absent-or-set,
 * and an explicit `undefined` is a third state the storage layer refuses.
 */
function compact(detail: z.infer<typeof provenanceDetailSchema> | null): ProvenanceDetail | null {
  if (detail === null) return null

  const result: Record<string, string> = {}
  for (const key of ['agent', 'model', 'at', 'prompt'] as const) {
    const value = detail[key]
    if (value !== undefined) result[key] = value
  }
  return result
}

function decode<TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body ?? {})
  if (result.success) return result.data

  // Only the paths, never the values: a rejected body is exactly the place a
  // password or a token would be sitting, and an error body is logged and
  // cached.
  const paths = result.error.issues
    .map((issue) => issue.path.join('.'))
    .filter((path) => path.length > 0)

  throw new CogentaError({
    code: 'CONTENT_INVALID',
    message:
      paths.length === 0
        ? 'The request body is not in the shape this route expects.'
        : `The request body is invalid at: ${paths.join(', ')}.`,
    hint: 'Send an object with `values`, and optionally `blocks`, `locale` and `status`.',
  })
}
