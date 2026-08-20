import { z } from 'zod'
import { CONTENT_STATUSES, PROVENANCE_KINDS, REVIEW_STATES } from './types.js'

/**
 * Contract A § "Champs système". Present on every entry of every collection,
 * never declared by the author, never optional.
 *
 * `provenance` least of all: the European AI framework requires knowing whether
 * a piece of content was written, assisted or generated, so it exists from the
 * first migration rather than being retrofitted once there is content.
 *
 * These are not `FieldDefinition`s. They are not authored, not translated, not
 * validated against user options — describing them as ordinary fields would let
 * a collection redeclare one, which is exactly what `defineCollection` refuses.
 */

export const SYSTEM_FIELD_NAMES = [
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'status',
  'deletedAt',
  'reviewState',
  'assignedReviewer',
  'locale',
  'translationOf',
  'version',
  'provenance',
  'provenanceDetail',
] as const

export type SystemFieldName = (typeof SYSTEM_FIELD_NAMES)[number]

const SYSTEM_FIELD_NAME_SET: ReadonlySet<string> = new Set(SYSTEM_FIELD_NAMES)

export function isSystemFieldName(name: string): name is SystemFieldName {
  return SYSTEM_FIELD_NAME_SET.has(name)
}

export const provenanceDetailSchema = z.strictObject({
  agent: z.string().optional(),
  model: z.string().optional(),
  at: z.iso.datetime({ offset: true }).optional(),
  /** Kept for audit. Never rendered, never handed back to a model (rule R7). */
  prompt: z.string().optional(),
})

export const systemFieldsSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().min(1).nullable(),
  updatedBy: z.string().min(1).nullable(),
  status: z.enum(CONTENT_STATUSES),
  /** Contract A § "Champs système" (`schema@2.0`): orthogonal to `status`. */
  deletedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Contract A § "Champs système" (`schema@2.1`, ADR-0027): orthogonal to `status`. */
  reviewState: z.enum(REVIEW_STATES),
  assignedReviewer: z.string().min(1).nullable(),
  /** Contract A § i18n: one entry per locale (ADR-0014). */
  locale: z.string().min(1),
  /** The source entry of a translation family, or `null` on the source itself. */
  translationOf: z.string().min(1).nullable(),
  version: z.number().int().min(1),
  provenance: z.enum(PROVENANCE_KINDS),
  provenanceDetail: provenanceDetailSchema.nullable(),
})

/** How the admin renders a system column. Mirrors `systemFieldsSchema`. */
export interface SystemFieldDescriptor {
  readonly name: SystemFieldName
  readonly type: 'id' | 'datetime' | 'enum' | 'string' | 'number' | 'json'
  readonly nullable: boolean
  /** Never writable by an editor: the runtime owns every one of these. */
  readonly readOnly: true
  readonly values?: readonly string[]
}

export const SYSTEM_FIELD_DESCRIPTORS: readonly SystemFieldDescriptor[] = [
  { name: 'id', type: 'id', nullable: false, readOnly: true },
  { name: 'createdAt', type: 'datetime', nullable: false, readOnly: true },
  { name: 'updatedAt', type: 'datetime', nullable: false, readOnly: true },
  { name: 'createdBy', type: 'id', nullable: true, readOnly: true },
  { name: 'updatedBy', type: 'id', nullable: true, readOnly: true },
  { name: 'status', type: 'enum', nullable: false, readOnly: true, values: CONTENT_STATUSES },
  { name: 'deletedAt', type: 'datetime', nullable: true, readOnly: true },
  {
    name: 'reviewState',
    type: 'enum',
    nullable: false,
    readOnly: true,
    values: REVIEW_STATES,
  },
  { name: 'assignedReviewer', type: 'id', nullable: true, readOnly: true },
  { name: 'locale', type: 'string', nullable: false, readOnly: true },
  { name: 'translationOf', type: 'id', nullable: true, readOnly: true },
  { name: 'version', type: 'number', nullable: false, readOnly: true },
  {
    name: 'provenance',
    type: 'enum',
    nullable: false,
    readOnly: true,
    values: PROVENANCE_KINDS,
  },
  { name: 'provenanceDetail', type: 'json', nullable: true, readOnly: true },
]
