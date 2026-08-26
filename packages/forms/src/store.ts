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
  FormCaptchaConfig,
  FormDefinition,
  FormFieldDefinition,
  FormFileValue,
  FormNotifyChannel,
  FormStepDefinition,
  FormSubmission,
  FormSubmissionNote,
  FormSubmissionStatus,
  RecordedConsent,
  UpdateFormDefinitionInput,
} from './types.js'
import { emailValueOf, FORM_FIELD_KINDS } from './types.js'
import {
  validateCaptchaConfig,
  validateDefinitionFields,
  validateFormSteps,
  validateNotifyChannels,
  validateSubmission,
} from './validate.js'

// Reserved: `forms-router.ts` mounts submission management under
// `/api/forms/submissions/*`, so a form literally named "submissions" would
// make `GET /api/forms/submissions` ambiguous between "the definition named
// submissions" and "every submission across every form".
const RESERVED_NAMES = new Set(['submissions'])

const DEFAULT_RETAIN_DAYS = 180
const DEFAULT_CONFIRMATION = 'Thank you — your message has been received.'
const DEFAULT_AUTORESPONDER: AutoresponderConfig = { enabled: false }
const DEFAULT_CAPTCHA: FormCaptchaConfig = { enabled: false }
const SUBMISSION_STATUSES: readonly FormSubmissionStatus[] = ['new', 'read', 'archived', 'spam']
const DAY_MS = 24 * 60 * 60 * 1000
// Fiche 47 task 7: a text search across `values_json`/`consents_json` is a
// full application-side scan (the same honest tradeoff `searchByEmail`
// already makes) rather than a dialect-specific `LIKE`, whose case
// sensitivity differs across SQLite/Postgres/MySQL. Bounded so an
// operator-triggered search on a very large form cannot become an unbounded
// read — this route is never a hot path.
const MAX_QUERY_SCAN_ROWS = 5_000

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
  // Grown in place (`ensureFormsTables`'s `alter table` block) — `null` on
  // any row written before fiche 47, which is why these three decode with a
  // fallback rather than through `toJson`'s "this row was not written by
  // this package" refusal.
  steps: unknown
  notify_channels: unknown
  captcha: unknown
  created_at: unknown
  updated_at: unknown
}

function toJsonOrDefault<T>(value: unknown, what: string, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback
  return toJson<T>(value, what)
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
    steps: toJsonOrDefault<readonly FormStepDefinition[]>(row.steps, 'form.steps', []),
    notifyChannels: toJsonOrDefault<readonly FormNotifyChannel[]>(
      row.notify_channels,
      'form.notify_channels',
      [],
    ),
    captcha: toJsonOrDefault<FormCaptchaConfig>(row.captcha, 'form.captcha', DEFAULT_CAPTCHA),
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

interface NoteRow {
  id: unknown
  submission_id: unknown
  author_id: unknown
  author_label: unknown
  body: unknown
  created_at: unknown
}

function decodeNote(row: NoteRow): FormSubmissionNote {
  return {
    id: toText(row.id, 'note.id'),
    submissionId: toText(row.submission_id, 'note.submission_id'),
    authorId: toNullableText(row.author_id),
    authorLabel: toText(row.author_label, 'note.author_label'),
    body: toText(row.body, 'note.body'),
    createdAt: toText(row.created_at, 'note.created_at'),
  }
}

function formUnknown(name: string): CogentaError {
  return new CogentaError({
    code: 'FORM_UNKNOWN',
    message: `No form named "${name}".`,
    hint: 'Check the form name, or create it first.',
  })
}

/** A submission value as plain text — a file field contributes its filename, never its bytes. */
function submissionValueText(value: string | readonly string[] | FormFileValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(' ')
  return (value as FormFileValue).filename
}

/** Task 7's text search: every value and every consent's recorded wording, matched case-insensitively. */
function submissionMatchesQuery(submission: FormSubmission, needleLower: string): boolean {
  for (const value of Object.values(submission.values)) {
    if (submissionValueText(value).toLowerCase().includes(needleLower)) return true
  }
  for (const consent of submission.consents) {
    if (consent.text.toLowerCase().includes(needleLower)) return true
  }
  return false
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
  /** Task 7 — an ISO instant; only submissions at or after it. Applied in SQL, same as `cursor`. */
  readonly from?: string
  /** Task 7 — an ISO instant; only submissions at or before it. */
  readonly to?: string
  /**
   * Task 7 — free text, matched case-insensitively against a submission's
   * own field values and consent text. Applied in application code after the
   * SQL filters above narrow the scan (see `MAX_QUERY_SCAN_ROWS`'s own
   * comment) — the honest cost of a form whose values are free-form JSON
   * with no dialect-portable full-text index.
   */
  readonly query?: string
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
  /** Task 11 — a real, independent copy: its own id, an available name derived from the original's, inactive by default so a duplicate never starts silently accepting submissions, and no submissions carried over. */
  duplicate(id: string): Promise<FormDefinition>
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
  /** Task 8 — an operator's own note. Never shown to the visitor, never included in a CSV export. */
  addNote(
    submissionId: string,
    body: string,
    author: { id: string | null; label: string },
  ): Promise<FormSubmissionNote>
  listNotes(submissionId: string): Promise<readonly FormSubmissionNote[]>
}

export interface FormStore {
  readonly definitions: FormDefinitionStore
  readonly submissions: FormSubmissionStore
}

export function createFormStore(db: DatabaseHandle, now: () => number = Date.now): FormStore {
  const d = db.dialect
  const definitionsTable = identifier(TABLES.definitions, d)
  const submissionsTable = identifier(TABLES.submissions, d)
  const notesTable = identifier(TABLES.submissionNotes, d)

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
      validateFormSteps(input.fields, input.steps ?? [])
      validateNotifyChannels(input.notifyChannels ?? [])
      validateCaptchaConfig(input.captcha ?? DEFAULT_CAPTCHA)

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
           notify_emails, autoresponder, retain_days, steps, notify_channels, captcha,
           created_at, updated_at)
        values (${id}, ${name}, ${input.label}, ${JSON.stringify(input.fields)},
                ${fromBool(input.active ?? true, d)}, ${input.confirmationMessage ?? DEFAULT_CONFIRMATION},
                ${input.redirectTo ?? null}, ${JSON.stringify(input.notifyEmails ?? [])},
                ${JSON.stringify(input.autoresponder ?? DEFAULT_AUTORESPONDER)},
                ${input.retainDays ?? DEFAULT_RETAIN_DAYS}, ${JSON.stringify(input.steps ?? [])},
                ${JSON.stringify(input.notifyChannels ?? [])},
                ${JSON.stringify(input.captcha ?? DEFAULT_CAPTCHA)}, ${at}, ${at})`)

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
      const nextSteps = input.steps ?? existing.steps
      if (input.steps !== undefined || input.fields !== undefined) {
        validateFormSteps(nextFields, nextSteps)
      }
      const nextNotifyChannels = input.notifyChannels ?? existing.notifyChannels
      if (input.notifyChannels !== undefined) validateNotifyChannels(nextNotifyChannels)
      const nextCaptcha = input.captcha ?? existing.captcha
      if (input.captcha !== undefined) validateCaptchaConfig(nextCaptcha)

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
          steps = ${JSON.stringify(nextSteps)},
          notify_channels = ${JSON.stringify(nextNotifyChannels)},
          captcha = ${JSON.stringify(nextCaptcha)},
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

    duplicate: async (id) => {
      const existing = await readDefinitionRow(id)
      if (existing === null) {
        throw new CogentaError({
          code: 'FORM_UNKNOWN',
          message: `No form with id "${id}".`,
          hint: 'It may have been deleted.',
        })
      }

      let candidate = `${existing.name}-copy`
      let suffix = 2
      while ((await readDefinitionByNameRow(candidate)) !== null) {
        candidate = `${existing.name}-copy-${suffix}`
        suffix += 1
      }

      return definitions.create({
        name: candidate,
        label: `${existing.label} (copy)`,
        fields: existing.fields,
        // Never active: a duplicate must not start accepting real
        // submissions before an operator has reviewed the copy (its route,
        // its notifications, its CAPTCHA secret) — the same caution
        // `active: true` by default elsewhere would defeat.
        active: false,
        confirmationMessage: existing.confirmationMessage,
        redirectTo: existing.redirectTo,
        notifyEmails: existing.notifyEmails,
        autoresponder: existing.autoresponder,
        retainDays: existing.retainDays,
        steps: existing.steps,
        notifyChannels: existing.notifyChannels,
        captcha: existing.captcha,
      })
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
      if (options.from !== undefined) clauses.push(sql`submitted_at >= ${options.from}`)
      if (options.to !== undefined) clauses.push(sql`submitted_at <= ${options.to}`)

      let where: SqlFragment = unsafeRaw('')
      for (const [index, clause] of clauses.entries()) {
        where = index === 0 ? sql`where ${clause}` : sql`${where} and ${clause}`
      }

      const needle = options.query?.trim().toLowerCase() ?? ''
      const hasQuery = needle !== ''
      // With a text query, the row count after filtering is not knowable in
      // SQL, so the cheap `limit + 1` "is there another page" trick is
      // replaced by pulling a bounded superset and filtering/paginating in
      // memory (see `MAX_QUERY_SCAN_ROWS`'s own comment above).
      const sqlLimit = hasQuery ? MAX_QUERY_SCAN_ROWS : limit + 1

      const result = await db.query<SubmissionRow>(
        sql`select * from ${submissionsTable} ${where} order by submitted_at desc limit ${sqlLimit}`,
      )
      let rows = result.rows.map(decodeSubmission)
      if (hasQuery) rows = rows.filter((submission) => submissionMatchesQuery(submission, needle))

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
      await db.query(sql`delete from ${notesTable} where submission_id = ${id}`)
      await db.query(sql`delete from ${submissionsTable} where id = ${id}`)
    },

    bulkRemove: async (ids) => {
      let count = 0
      for (const id of ids) {
        await db.query(sql`delete from ${notesTable} where submission_id = ${id}`)
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
        await db.query(sql`delete from ${notesTable} where submission_id = ${match.id}`)
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
        const expiredResult = await db.query<{ id: unknown }>(
          sql`select id from ${submissionsTable} where form_id = ${form.id} and submitted_at < ${cutoff}`,
        )
        for (const row of expiredResult.rows) {
          await db.query(sql`delete from ${notesTable} where submission_id = ${row.id}`)
        }
        const result = await db.query(
          sql`delete from ${submissionsTable} where form_id = ${form.id} and submitted_at < ${cutoff}`,
        )
        purged += result.rowsAffected
      }
      return { purged }
    },

    addNote: async (submissionId, body, author) => {
      const submission = await readSubmissionRow(submissionId)
      if (submission === null) {
        throw new CogentaError({
          code: 'FORM_SUBMISSION_NOT_FOUND',
          message: `No submission with id "${submissionId}".`,
          hint: 'It may have been deleted.',
        })
      }
      const trimmed = body.trim()
      if (trimmed === '') {
        throw new CogentaError({
          code: 'FORM_SUBMISSION_INVALID',
          message: 'A note needs some text.',
          hint: 'Write something before saving the note.',
        })
      }
      const id = newId(now)
      const at = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${notesTable} (id, submission_id, author_id, author_label, body, created_at)
        values (${id}, ${submissionId}, ${author.id}, ${author.label}, ${trimmed}, ${at})`)
      const result = await db.query<NoteRow>(sql`select * from ${notesTable} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The note was not stored.',
          hint: 'Check that the forms tables exist (ensureFormsTables).',
        })
      }
      return decodeNote(row)
    },

    listNotes: async (submissionId) => {
      const result = await db.query<NoteRow>(
        sql`select * from ${notesTable} where submission_id = ${submissionId} order by created_at asc`,
      )
      return result.rows.map(decodeNote)
    },
  }

  return { definitions, submissions }
}
