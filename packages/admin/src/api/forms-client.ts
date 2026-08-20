import { authHeader, request, requestBody } from './http.js'

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
] as const
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number]

export interface FormFieldDefinition {
  readonly name: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required: boolean
  readonly help?: string
  readonly choices?: readonly string[]
  readonly consentText?: string
}

export interface AutoresponderConfig {
  readonly enabled: boolean
  readonly subject?: string
  readonly body?: string
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
  readonly createdAt: string
  readonly updatedAt: string
}

export type FormDefinitionInput = Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>

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
  readonly values: Readonly<Record<string, string | readonly string[]>>
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
  return params
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
