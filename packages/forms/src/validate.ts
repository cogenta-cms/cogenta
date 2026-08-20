import { CogentaError } from '@cogenta/core'
import type { FormDefinition, FormFieldDefinition, RecordedConsent } from './types.js'

/**
 * Full server-side validation, independent of whatever the client did or
 * did not check (fiche 16 task 3's own requirement, and the same standard
 * `@cogenta/commerce`'s stores hold their own writes to). Never trusts a
 * shape the browser sent: a `choiceMulti` answer for a field it does not
 * know, a `consent` box the definition never declared, or a value that
 * arrived as an object are all rejected here, the same way whether the
 * caller was a browser form post or a JSON API client.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
// Loose on purpose: a phone number is free text almost everywhere in the
// world (extensions, country codes, spaces) — this rejects control
// characters and enforces a sane length, not a dial plan.
const PHONE_RE = /^[+()0-9 .-]{3,32}$/u
const MAX_TEXT_LENGTH = 2_000
const MAX_LONG_TEXT_LENGTH = 20_000

export interface ValidatedSubmission {
  readonly values: Readonly<Record<string, string | readonly string[]>>
  readonly consents: readonly RecordedConsent[]
}

function invalid(field: string, reason: string): CogentaError {
  return new CogentaError({
    code: 'FORM_SUBMISSION_INVALID',
    message: `"${field}" ${reason}.`,
    hint: 'Check the value sent for this field and try again.',
    details: { field },
  })
}

function readRawString(raw: unknown, field: FormFieldDefinition): string {
  if (typeof raw === 'string') return raw.trim()
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') return raw[0].trim()
  throw invalid(field.name, 'must be a single text value')
}

function readRawList(raw: unknown, field: FormFieldDefinition): readonly string[] {
  if (typeof raw === 'string') return raw.trim() === '' ? [] : [raw.trim()]
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      if (typeof entry !== 'string') throw invalid(field.name, 'must be a list of text values')
      return entry.trim()
    })
  }
  throw invalid(field.name, 'must be a list of text values')
}

function validateField(
  field: FormFieldDefinition,
  raw: unknown,
  now: () => number,
): { readonly value: string | readonly string[] | undefined; readonly consent?: RecordedConsent } {
  const present =
    raw !== undefined &&
    raw !== null &&
    !(typeof raw === 'string' && raw.trim() === '') &&
    !(Array.isArray(raw) && raw.length === 0)

  if (!present) {
    if (field.required) throw invalid(field.name, 'is required')
    return { value: undefined }
  }

  switch (field.kind) {
    case 'text': {
      const value = readRawString(raw, field)
      if (value.length > MAX_TEXT_LENGTH)
        throw invalid(field.name, `must be at most ${MAX_TEXT_LENGTH} characters`)
      return { value }
    }
    case 'longText': {
      const value = readRawString(raw, field)
      if (value.length > MAX_LONG_TEXT_LENGTH) {
        throw invalid(field.name, `must be at most ${MAX_LONG_TEXT_LENGTH} characters`)
      }
      return { value }
    }
    case 'email': {
      const value = readRawString(raw, field).toLowerCase()
      if (!EMAIL_RE.test(value)) throw invalid(field.name, 'must be a valid e-mail address')
      return { value }
    }
    case 'phone': {
      const value = readRawString(raw, field)
      if (!PHONE_RE.test(value)) throw invalid(field.name, 'must be a valid phone number')
      return { value }
    }
    case 'number': {
      const text = readRawString(raw, field)
      const value = Number(text)
      if (!Number.isFinite(value)) throw invalid(field.name, 'must be a number')
      return { value: String(value) }
    }
    case 'date': {
      const value = readRawString(raw, field)
      if (Number.isNaN(new Date(value).getTime())) throw invalid(field.name, 'must be a valid date')
      return { value }
    }
    case 'choiceSingle': {
      const value = readRawString(raw, field)
      const choices = field.choices ?? []
      if (!choices.includes(value)) throw invalid(field.name, 'must be one of the offered choices')
      return { value }
    }
    case 'choiceMulti': {
      const values = readRawList(raw, field)
      const choices = field.choices ?? []
      for (const value of values) {
        if (!choices.includes(value)) throw invalid(field.name, 'must only contain offered choices')
      }
      return { value: values }
    }
    case 'consent': {
      const value = readRawString(raw, field)
      const agreed = value === 'true' || value === 'on' || value === '1' || value === 'yes'
      if (!agreed) {
        throw new CogentaError({
          code: 'FORM_CONSENT_REQUIRED',
          message: `Consent for "${field.name}" is required to submit this form.`,
          hint: 'Tick the consent checkbox before submitting.',
          details: { field: field.name },
        })
      }
      return {
        value: 'true',
        consent: {
          fieldName: field.name,
          // The wording as it stands *right now*, recorded verbatim onto the
          // submission — this is what has probative value, per ADR-0026 and
          // the fiche's own reminder: "le texte au moment du recueil compte,
          // pas celui d'aujourd'hui".
          text: field.consentText ?? field.label,
          agreedAt: new Date(now()).toISOString(),
        },
      }
    }
    default: {
      const exhaustive: never = field.kind
      throw invalid(field.name, `has an unknown field kind ${String(exhaustive)}`)
    }
  }
}

/**
 * Validates a raw submission body against a form's own definition. Rejects
 * any key the definition does not declare — a client cannot smuggle an
 * extra column into what gets stored.
 */
export function validateSubmission(
  definition: FormDefinition,
  rawValues: Readonly<Record<string, unknown>>,
  now: () => number = Date.now,
): ValidatedSubmission {
  if (!definition.active) {
    throw new CogentaError({
      code: 'FORM_DISABLED',
      message: `The form "${definition.name}" is not accepting submissions.`,
      hint: 'This form has been switched off by its owner.',
    })
  }

  const known = new Set(definition.fields.map((field) => field.name))
  for (const key of Object.keys(rawValues)) {
    if (key.startsWith('_')) continue // anti-abuse fields (honeypot, timestamp) — never stored as an answer.
    if (!known.has(key)) throw invalid(key, 'is not a field on this form')
  }

  const values: Record<string, string | readonly string[]> = {}
  const consents: RecordedConsent[] = []

  for (const field of definition.fields) {
    const outcome = validateField(field, rawValues[field.name], now)
    if (outcome.value !== undefined) values[field.name] = outcome.value
    if (outcome.consent !== undefined) consents.push(outcome.consent)
  }

  return { values, consents }
}

/** A definition's own fields must be internally consistent — checked once, at create/update time. */
export function validateDefinitionFields(fields: readonly FormFieldDefinition[]): void {
  if (fields.length === 0) {
    throw new CogentaError({
      code: 'FORM_DEFINITION_INVALID',
      message: 'A form needs at least one field.',
      hint: 'Add at least one field before saving.',
    })
  }
  const seen = new Set<string>()
  for (const field of fields) {
    if (field.name.trim() === '' || !/^[a-zA-Z][a-zA-Z0-9_]*$/u.test(field.name)) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}" is not a valid field name.`,
        hint: 'Field names start with a letter and contain only letters, digits and underscores.',
      })
    }
    if (seen.has(field.name)) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `Field name "${field.name}" is used more than once.`,
        hint: 'Every field needs a unique name.',
      })
    }
    seen.add(field.name)
    if (
      (field.kind === 'choiceSingle' || field.kind === 'choiceMulti') &&
      (field.choices ?? []).length === 0
    ) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}" needs at least one choice.`,
        hint: 'Add at least one choice for this field.',
      })
    }
    if (field.kind === 'consent' && (field.consentText ?? '').trim() === '') {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}" needs its consent wording.`,
        hint: 'A consent field must carry the exact text shown to whoever ticks it — this is what has probative value later.',
      })
    }
  }
}
