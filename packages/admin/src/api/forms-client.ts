import { API_BASE, ApiError, authHeader, request, requestBody } from './http.js'

/**
 * The thin fetch layer over `/api/forms/*` (contract G, ADR-0026, fiche 16),
 * hand-mirrored from `@cogenta/api`'s `forms-router.ts` for the same reason
 * every other `*-client.ts` here copies its server-side shape: this is a
 * browser bundle, and the server package is Node code.
 */

export const FORM_FIELD_KINDS = [
  'text',
  'longText',
  'email',
  'phone',
  'number',
  'date',
  'choiceSingle',
  'choiceMulti',
  'consent',
  'file',
] as const
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number]

export const FORM_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'isEmpty',
  'isNotEmpty',
] as const
export type FormConditionOperator = (typeof FORM_CONDITION_OPERATORS)[number]

export interface FormFieldCondition {
  readonly field: string
  readonly operator: FormConditionOperator
  readonly value?: string
}

export const FORM_FILE_CATEGORIES = ['image', 'pdf', 'document', 'text'] as const
export type FormFileCategory = (typeof FORM_FILE_CATEGORIES)[number]

export interface FormFileValue {
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly storageKey: string
}

export function isFormFileValue(value: unknown): value is FormFileValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<FormFileValue>).filename === 'string' &&
    typeof (value as Partial<FormFileValue>).mimeType === 'string' &&
    typeof (value as Partial<FormFileValue>).size === 'number' &&
    typeof (value as Partial<FormFileValue>).storageKey === 'string'
  )
}

export interface FormFieldDefinition {
  readonly name: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required: boolean
  readonly help?: string
  readonly choices?: readonly string[]
  readonly consentText?: string
  readonly showIf?: FormFieldCondition
  readonly acceptCategories?: readonly FormFileCategory[]
  readonly maxSizeBytes?: number
}

export interface AutoresponderConfig {
  readonly enabled: boolean
  readonly subject?: string
  readonly body?: string
}

export interface FormStepDefinition {
  readonly name: string
  readonly label: string
  readonly fieldNames: readonly string[]
}

export interface FormNotifyChannel {
  readonly channel: string
  readonly target: string
}

export interface FormCaptchaConfig {
  readonly enabled: boolean
  readonly siteKey?: string
  readonly secretKey?: string
}

export interface FormDefinition {
  readonly id: string
  readonly name: string
  readonly label: string
  readonly fields: readonly FormFieldDefinition[]
  readonly active: boolean
  readonly confirmationMessage: string
  readonly redirectTo: string | null
  readonly notifyEmails: readonly string[]
  readonly autoresponder: AutoresponderConfig
  readonly retainDays: number
  readonly steps: readonly FormStepDefinition[]
  readonly notifyChannels: readonly FormNotifyChannel[]
  readonly captcha: FormCaptchaConfig
  readonly createdAt: string
  readonly updatedAt: string
}

export type FormDefinitionInput = Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>

export function duplicateForm(token: string, id: string): Promise<FormDefinition> {
  return request(`/api/forms/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function listForms(token: string): Promise<readonly FormDefinition[]> {
  return request('/api/forms', { headers: authHeader(token) })
}

export function readForm(token: string, id: string): Promise<FormDefinition> {
  return request(`/api/forms/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export function createForm(
  token: string,
  input: Partial<FormDefinitionInput> & Pick<FormDefinitionInput, 'name' | 'label' | 'fields'>,
): Promise<FormDefinition> {
  return request('/api/forms', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updateForm(
  token: string,
  id: string,
  input: Partial<FormDefinitionInput>,
): Promise<FormDefinition> {
  return request(`/api/forms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteForm(token: string, id: string): Promise<void> {
  await request(`/api/forms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

// ------------------------------------------------------------- submissions

export type FormSubmissionStatus = 'new' | 'read' | 'archived' | 'spam'

export interface RecordedConsent {
  readonly fieldName: string
  readonly text: string
  readonly agreedAt: string
}

export interface FormSubmission {
  readonly id: string
  readonly formId: string
  readonly formName: string
  readonly values: Readonly<Record<string, string | readonly string[] | FormFileValue>>
  readonly consents: readonly RecordedConsent[]
  readonly status: FormSubmissionStatus
  readonly ipHash: string | null
  readonly referrer: string | null
  readonly userAgent: string | null
  readonly submittedAt: string
}

export interface ListSubmissionsOptions {
  readonly formId?: string
  readonly status?: FormSubmissionStatus
  readonly limit?: number
  readonly cursor?: string
  /** Task 7 — ISO instants bounding `submittedAt`. */
  readonly from?: string
  readonly to?: string
  /** Task 7 — free text, matched against a submission's own values and consent text. */
  readonly query?: string
}

export interface ListSubmissionsResult {
  readonly items: readonly FormSubmission[]
  readonly nextCursor: string | null
}

function submissionSearchParams(options: ListSubmissionsOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (options.formId !== undefined) params.set('formId', options.formId)
  if (options.status !== undefined) params.set('status', options.status)
  if (options.cursor !== undefined) params.set('cursor', options.cursor)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  if (options.from !== undefined) params.set('from', options.from)
  if (options.to !== undefined) params.set('to', options.to)
  if (options.query !== undefined && options.query.trim() !== '')
    params.set('q', options.query.trim())
  return params
}

/**
 * Task 9 — downloads the server-streamed export (`serve.ts`'s
 * `serveFormsSubmissionsExport`). This admin only ever authenticates with a
 * bearer token (never a cookie), and a plain `<a href>` navigation has no
 * way to attach an `Authorization` header — so this fetches with one, the
 * same as every other admin request, and saves the response body as a file
 * client-side. The server itself never held the whole export in memory at
 * once (`streamSubmissionsCsv`'s own doc comment); a browser download
 * inherently has to buffer what it saves, which is a different, unavoidable
 * constraint from the one this task is actually about.
 */
export async function downloadSubmissionsCsv(
  token: string,
  options: Pick<ListSubmissionsOptions, 'formId' | 'status' | 'from' | 'to' | 'query'> = {},
): Promise<void> {
  const params = submissionSearchParams(options)
  const response = await fetch(
    `${API_BASE}/api/forms/submissions/export.csv?${params.toString()}`,
    {
      headers: authHeader(token),
    },
  )
  if (!response.ok) {
    throw new ApiError('INTERNAL', 'The export could not be downloaded.', undefined)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'form-submissions.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function listSubmissions(
  token: string,
  options: ListSubmissionsOptions = {},
): Promise<ListSubmissionsResult> {
  const query = submissionSearchParams(options).toString()
  const body = await requestBody<{
    readonly data: readonly FormSubmission[]
    readonly nextCursor: string | null
  }>(`/api/forms/submissions${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
  return { items: body.data, nextCursor: body.nextCursor }
}

export function readSubmission(token: string, id: string): Promise<FormSubmission> {
  return request(`/api/forms/submissions/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export function markSubmissionStatus(
  token: string,
  id: string,
  status: FormSubmissionStatus,
): Promise<FormSubmission> {
  return request(`/api/forms/submissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  })
}

export async function deleteSubmission(token: string, id: string): Promise<void> {
  await request(`/api/forms/submissions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export type BulkSubmissionAction = FormSubmissionStatus | 'delete'

export async function bulkSubmissionAction(
  token: string,
  ids: readonly string[],
  action: BulkSubmissionAction,
): Promise<number> {
  const body = await requestBody<{ readonly data: { readonly updated: number } }>(
    '/api/forms/submissions/bulk',
    { method: 'POST', headers: authHeader(token), body: JSON.stringify({ ids, action }) },
  )
  return body.data.updated
}

export function unreadSubmissionCount(token: string): Promise<{ readonly count: number }> {
  return request('/api/forms/submissions/unread-count', { headers: authHeader(token) })
}

/** GDPR export request (fiche 16 task 7's minimum: search across submissions by e-mail). */
export function searchSubmissionsByEmail(
  token: string,
  email: string,
): Promise<readonly FormSubmission[]> {
  return request(`/api/forms/submissions/search?email=${encodeURIComponent(email)}`, {
    headers: authHeader(token),
  })
}

/** GDPR erasure request: every submission naming this e-mail address, gone. */
export async function eraseSubmissionsByEmail(
  token: string,
  email: string,
): Promise<{ readonly erased: number }> {
  return request(`/api/forms/submissions/by-email?email=${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

// ---------------------------------------------------------------- notes (task 8)

export interface FormSubmissionNote {
  readonly id: string
  readonly submissionId: string
  readonly authorId: string | null
  readonly authorLabel: string
  readonly body: string
  readonly createdAt: string
}

export function listSubmissionNotes(
  token: string,
  submissionId: string,
): Promise<readonly FormSubmissionNote[]> {
  return request(`/api/forms/submissions/${encodeURIComponent(submissionId)}/notes`, {
    headers: authHeader(token),
  })
}

export function addSubmissionNote(
  token: string,
  submissionId: string,
  body: string,
): Promise<FormSubmissionNote> {
  return request(`/api/forms/submissions/${encodeURIComponent(submissionId)}/notes`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  })
}
