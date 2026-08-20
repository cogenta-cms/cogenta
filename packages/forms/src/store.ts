import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import { fromBool, toBool, toInt, toJson, toNullableText, toText } from './rows.js'
import { TABLES } from './tables.js'
import type {
  AutoresponderConfig,
  CreateFormDefinitionInput,
  FormDefinition,
  FormFieldDefinition,
  FormSubmission,
  FormSubmissionStatus,
  RecordedConsent,
  UpdateFormDefinitionInput,
} from './types.js'
import { emailValueOf, FORM_FIELD_KINDS } from './types.js'
import { validateDefinitionFields, validateSubmission } from './validate.js'

// Reserved: `forms-router.ts` mounts submission management under
// `/api/forms/submissions/*`, so a form literally named "submissions" would
// make `GET /api/forms/submissions` ambiguous between "the definition named
// submissions" and "every submission across every form".
const RESERVED_NAMES = new Set(['submissions'])

const DEFAULT_RETAIN_DAYS = 180
const DEFAULT_CONFIRMATION = 'Thank you — your message has been received.'
const DEFAULT_AUTORESPONDER: AutoresponderConfig = { enabled: false }
const SUBMISSION_STATUSES: readonly FormSubmissionStatus[] = ['new', 'read', 'archived', 'spam']
const DAY_MS = 24 * 60 * 60 * 1000

function slugName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

interface DefinitionRow {
  id: unknown
  name: unknown
  label: unknown
  fields: unknown
  active: unknown
  confirmation_message: unknown
  redirect_to: unknown
  notify_emails: unknown
  autoresponder: unknown
  retain_days: unknown
  created_at: unknown
  updated_at: unknown
}

function decodeDefinition(row: DefinitionRow): FormDefinition {
  return {
    id: toText(row.id, 'form.id'),
    name: toText(row.name, 'form.name'),
    label: toText(row.label, 'form.label'),
    fields: toJson<readonly FormFieldDefinition[]>(row.fields, 'form.fields'),
    active: toBool(row.active),
    confirmationMessage: toText(row.confirmation_message, 'form.confirmation_message'),
    redirectTo: toNullableText(row.redirect_to),
    notifyEmails: toJson<readonly string[]>(row.notify_emails, 'form.notify_emails'),
    autoresponder: toJson<AutoresponderConfig>(row.autoresponder, 'form.autoresponder'),
    retainDays: toInt(row.retain_days, 'form.retain_days'),
    createdAt: toText(row.created_at, 'form.created_at'),
    updatedAt: toText(row.updated_at, 'form.updated_at'),
  }
}

interface SubmissionRow {
  id: unknown
  form_id: unknown
  form_name: unknown
  values_json: unknown
  consents_json: unknown
  status: unknown
  ip_hash: unknown
  referrer: unknown
  user_agent: unknown
  submitted_at: unknown
}

function decodeSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: toText(row.id, 'submission.id'),
    formId: toText(row.form_id, 'submission.form_id'),
    formName: toText(row.form_name, 'submission.form_name'),
    values: toJson(row.values_json, 'submission.values_json'),
    consents: toJson<readonly RecordedConsent[]>(row.consents_json, 'submission.consents_json'),
    status: toText(row.status, 'submission.status') as FormSubmissionStatus,
    ipHash: toNullableText(row.ip_hash),
    referrer: toNullableText(row.referrer),
    userAgent: toNullableText(row.user_agent),
    submittedAt: toText(row.submitted_at, 'submission.submitted_at'),
  }
}

function formUnknown(name: string): CogentaError {
  return new CogentaError({
    code: 'FORM_UNKNOWN',
    message: `No form named "${name}".`,
    hint: 'Check the form name, or create it first.',
  })
}

export interface SubmitOptions {
  readonly ip?: string | null
  readonly referrer?: string | null
  readonly userAgent?: string | null
}

export interface ListSubmissionsOptions {
  readonly formId?: string
  readonly status?: FormSubmissionStatus
  readonly limit?: number
  readonly cursor?: string
}

export interface ListSubmissionsResult {
  readonly items: readonly FormSubmission[]
  readonly nextCursor: string | null
}

export interface PurgeReport {
  readonly purged: number
}

export interface FormDefinitionStore {
  create(input: CreateFormDefinitionInput): Promise<FormDefinition>
  read(id: string): Promise<FormDefinition | null>
  readByName(name: string): Promise<FormDefinition | null>
  list(): Promise<readonly FormDefinition[]>
  update(id: string, input: UpdateFormDefinitionInput): Promise<FormDefinition>
  remove(id: string): Promise<void>
}

export interface FormSubmissionStore {
  /** Full server-side validation happens here — `validateSubmission` — never trusting whatever the client already checked. */
  submit(
    formName: string,
    rawValues: Readonly<Record<string, unknown>>,
    options?: SubmitOptions,
  ): Promise<FormSubmission>
  read(id: string): Promise<FormSubmission | null>
  list(options?: ListSubmissionsOptions): Promise<ListSubmissionsResult>
  markStatus(id: string, status: FormSubmissionStatus): Promise<FormSubmission>
  bulkMarkStatus(ids: readonly string[], status: FormSubmissionStatus): Promise<number>
  remove(id: string): Promise<void>
  bulkRemove(ids: readonly string[]): Promise<number>
  unreadCount(): Promise<number>
  /** GDPR task 7's minimum: an e-mail-based search across submissions, for export/deletion requests. */
  searchByEmail(email: string): Promise<readonly FormSubmission[]>
  /** GDPR erasure: every submission naming this e-mail address, gone. */
  deleteByEmail(email: string): Promise<number>
  /** Removes submissions older than each form's own `retainDays` (ADR-0022's `purgeExpired` model, applied to submissions rather than content). */
  purgeExpired(): Promise<PurgeReport>
}

export interface FormStore {
  readonly definitions: FormDefinitionStore
  readonly submissions: FormSubmissionStore
}

export function createFormStore(db: DatabaseHandle, now: () => number = Date.now): FormStore {
  const d = db.dialect
  const definitionsTable = identifier(TABLES.definitions, d)
  const submissionsTable = identifier(TABLES.submissions, d)

  async function readDefinitionRow(id: string): Promise<FormDefinition | null> {
    const result = await db.query<DefinitionRow>(
      sql`select * from ${definitionsTable} where id = ${id}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decodeDefinition(row)
  }

  async function readDefinitionByNameRow(name: string): Promise<FormDefinition | null> {
    const result = await db.query<DefinitionRow>(
      sql`select * from ${definitionsTable} where name = ${name}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decodeDefinition(row)
  }

  const definitions: FormDefinitionStore = {
    create: async (input) => {
      const name = slugName(input.name)
      if (name === '') {
        throw new CogentaError({
          code: 'FORM_DEFINITION_INVALID',
          message: 'A form needs a usable name.',
          hint: 'Give the form a label with at least one letter or digit.',
        })
      }
      if (RESERVED_NAMES.has(name)) {
        throw new CogentaError({
          code: 'FORM_NAME_TAKEN',
          message: `"${name}" is a reserved name and cannot be used for a form.`,
          hint: 'Choose a different name.',
        })
      }
      for (const field of input.fields) {
        if (!(FORM_FIELD_KINDS as readonly string[]).includes(field.kind)) {
          throw new CogentaError({
            code: 'FORM_DEFINITION_INVALID',
            message: `"${field.kind}" is not a form field kind.`,
            hint: `Use one of: ${FORM_FIELD_KINDS.join(', ')}.`,
          })
        }
      }
      validateDefinitionFields(input.fields)

      if ((await readDefinitionByNameRow(name)) !== null) {
        throw new CogentaError({
          code: 'FORM_NAME_TAKEN',
          message: `A form named "${name}" already exists.`,
          hint: 'Choose a different name, or edit the existing form.',
        })
      }

      const id = newId(now)
      const at = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${definitionsTable}
          (id, name, label, fields, active, confirmation_message, redirect_to,
           notify_emails, autoresponder, retain_days, created_at, updated_at)
        values (${id}, ${name}, ${input.label}, ${JSON.stringify(input.fields)},
                ${fromBool(input.active ?? true, d)}, ${input.confirmationMessage ?? DEFAULT_CONFIRMATION},
                ${input.redirectTo ?? null}, ${JSON.stringify(input.notifyEmails ?? [])},
                ${JSON.stringify(input.autoresponder ?? DEFAULT_AUTORESPONDER)},
                ${input.retainDays ?? DEFAULT_RETAIN_DAYS}, ${at}, ${at})`)

      const created = await readDefinitionRow(id)
      if (created === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The form was not stored.',
          hint: 'Check that the forms tables exist (ensureFormsTables).',
        })
      }
      return created
    },

    read: readDefinitionRow,
    readByName: readDefinitionByNameRow,

    list: async () => {
      const result = await db.query<DefinitionRow>(
        sql`select * from ${definitionsTable} order by created_at desc`,
      )
      return result.rows.map(decodeDefinition)
    },

    update: async (id, input) => {
      const existing = await readDefinitionRow(id)
      if (existing === null) {
        throw new CogentaError({
          code: 'FORM_UNKNOWN',
          message: `No form with id "${id}".`,
          hint: 'It may have been deleted.',
        })
      }

      const nextFields = input.fields ?? existing.fields
      if (input.fields !== undefined) {
        for (const field of nextFields) {
          if (!(FORM_FIELD_KINDS as readonly string[]).includes(field.kind)) {
            throw new CogentaError({
              code: 'FORM_DEFINITION_INVALID',
              message: `"${field.kind}" is not a form field kind.`,
              hint: `Use one of: ${FORM_FIELD_KINDS.join(', ')}.`,
            })
          }
        }
        validateDefinitionFields(nextFields)
      }

      let nextName = existing.name
      if (input.name !== undefined) {
        nextName = slugName(input.name)
        if (RESERVED_NAMES.has(nextName)) {
          throw new CogentaError({
            code: 'FORM_NAME_TAKEN',
            message: `"${nextName}" is a reserved name and cannot be used for a form.`,
            hint: 'Choose a different name.',
          })
        }
        const clash = await readDefinitionByNameRow(nextName)
        if (clash !== null && clash.id !== id) {
          throw new CogentaError({
            code: 'FORM_NAME_TAKEN',
            message: `A form named "${nextName}" already exists.`,
            hint: 'Choose a different name.',
          })
        }
      }

      const at = new Date(now()).toISOString()
      await db.query(sql`
        update ${definitionsTable} set
          name = ${nextName},
          label = ${input.label ?? existing.label},
          fields = ${JSON.stringify(nextFields)},
          active = ${fromBool(input.active ?? existing.active, d)},
          confirmation_message = ${input.confirmationMessage ?? existing.confirmationMessage},
          redirect_to = ${input.redirectTo === undefined ? existing.redirectTo : input.redirectTo},
          notify_emails = ${JSON.stringify(input.notifyEmails ?? existing.notifyEmails)},
          autoresponder = ${JSON.stringify(input.autoresponder ?? existing.autoresponder)},
          retain_days = ${input.retainDays ?? existing.retainDays},
          updated_at = ${at}
        where id = ${id}`)

      const updated = await readDefinitionRow(id)
      if (updated === null) {
        throw new CogentaError({
          code: 'FORM_UNKNOWN',
          message: `No form with id "${id}".`,
          hint: 'It may have been deleted.',
        })
      }
      return updated
    },

    remove: async (id) => {
      await db.query(sql`delete from ${submissionsTable} where form_id = ${id}`)
      await db.query(sql`delete from ${definitionsTable} where id = ${id}`)
    },
  }

  async function readSubmissionRow(id: string): Promise<FormSubmission | null> {
    const result = await db.query<SubmissionRow>(
      sql`select * from ${submissionsTable} where id = ${id}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decodeSubmission(row)
  }

  const submissions: FormSubmissionStore = {
    submit: async (formName, rawValues, options = {}) => {
      const name = slugName(formName)
      const definition = await readDefinitionByNameRow(name)
      if (definition === null) throw formUnknown(formName)

      const validated = validateSubmission(definition, rawValues, now)

      const id = newId(now)
      const at = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${submissionsTable}
          (id, form_id, form_name, values_json, consents_json, status, ip_hash, referrer, user_agent, submitted_at)
        values (${id}, ${definition.id}, ${definition.name}, ${JSON.stringify(validated.values)},
                ${JSON.stringify(validated.consents)}, ${'new'},
                ${options.ip ?? null}, ${options.referrer ?? null}, ${options.userAgent ?? null}, ${at})`)

      const created = await readSubmissionRow(id)
      if (created === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The submission was not stored.',
          hint: 'Check that the forms tables exist (ensureFormsTables).',
        })
      }
      return created
    },

    read: readSubmissionRow,

    list: async (options = {}) => {
      const limit = Math.min(options.limit ?? 50, 200)
      const clauses: SqlFragment[] = []
      if (options.formId !== undefined) clauses.push(sql`form_id = ${options.formId}`)
      if (options.status !== undefined) clauses.push(sql`status = ${options.status}`)
      if (options.cursor !== undefined) clauses.push(sql`submitted_at < ${options.cursor}`)

      let where: SqlFragment = unsafeRaw('')
      for (const [index, clause] of clauses.entries()) {
        where = index === 0 ? sql`where ${clause}` : sql`${where} and ${clause}`
      }

      const result = await db.query<SubmissionRow>(
        sql`select * from ${submissionsTable} ${where} order by submitted_at desc limit ${limit + 1}`,
      )
      const rows = result.rows.map(decodeSubmission)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      return { items, nextCursor: hasMore ? (items[items.length - 1]?.submittedAt ?? null) : null }
    },

    markStatus: async (id, status) => {
      if (!SUBMISSION_STATUSES.includes(status)) {
        throw new CogentaError({
          code: 'FORM_SUBMISSION_INVALID',
          message: `"${status}" is not a submission status.`,
          hint: `Use one of: ${SUBMISSION_STATUSES.join(', ')}.`,
        })
      }
      await db.query(sql`update ${submissionsTable} set status = ${status} where id = ${id}`)
      const updated = await readSubmissionRow(id)
      if (updated === null) {
        throw new CogentaError({
          code: 'FORM_SUBMISSION_NOT_FOUND',
          message: `No submission with id "${id}".`,
          hint: 'It may already have been deleted.',
        })
      }
      return updated
    },

    bulkMarkStatus: async (ids, status) => {
      if (!SUBMISSION_STATUSES.includes(status)) {
        throw new CogentaError({
          code: 'FORM_SUBMISSION_INVALID',
          message: `"${status}" is not a submission status.`,
          hint: `Use one of: ${SUBMISSION_STATUSES.join(', ')}.`,
        })
      }
      let count = 0
      for (const id of ids) {
        const result = await db.query(
          sql`update ${submissionsTable} set status = ${status} where id = ${id}`,
        )
        count += result.rowsAffected
      }
      return count
    },

    remove: async (id) => {
      await db.query(sql`delete from ${submissionsTable} where id = ${id}`)
    },

    bulkRemove: async (ids) => {
      let count = 0
      for (const id of ids) {
        const result = await db.query(sql`delete from ${submissionsTable} where id = ${id}`)
        count += result.rowsAffected
      }
      return count
    },

    unreadCount: async () => {
      const result = await db.query<{ n: unknown }>(
        sql`select count(*) as n from ${submissionsTable} where status = ${'new'}`,
      )
      return toInt(result.rows[0]?.n ?? 0, 'unread count')
    },

    searchByEmail: async (email) => {
      const normalised = email.trim().toLowerCase()
      // The e-mail lives inside `values_json`, one key per form's own `email`
      // field — there is no dedicated column to index it under, since a form
      // is not required to collect an e-mail at all. A full scan is the
      // honest cost of that flexibility; this route is an operator-triggered
      // GDPR request, never a hot path.
      const result = await db.query<SubmissionRow>(sql`select * from ${submissionsTable}`)
      const definitionsById = new Map<string, FormDefinition>()
      const matches: FormSubmission[] = []
      for (const row of result.rows) {
        const submission = decodeSubmission(row)
        let definition = definitionsById.get(submission.formId)
        if (definition === undefined) {
          const found = await readDefinitionRow(submission.formId)
          if (found !== null) {
            definition = found
            definitionsById.set(submission.formId, found)
          }
        }
        const value = definition === undefined ? null : emailValueOf(submission, definition.fields)
        if (value === normalised) matches.push(submission)
      }
      return matches
    },

    deleteByEmail: async (email) => {
      const matches = await submissions.searchByEmail(email)
      let count = 0
      for (const match of matches) {
        const result = await db.query(sql`delete from ${submissionsTable} where id = ${match.id}`)
        count += result.rowsAffected
      }
      return count
    },

    purgeExpired: async () => {
      const forms = await definitions.list()
      let purged = 0
      for (const form of forms) {
        const cutoff = new Date(now() - form.retainDays * DAY_MS).toISOString()
        const result = await db.query(
          sql`delete from ${submissionsTable} where form_id = ${form.id} and submitted_at < ${cutoff}`,
        )
        purged += result.rowsAffected
      }
      return { purged }
    },
  }

  return { definitions, submissions }
}
