import { CogentaError } from '@cogenta/core'
import { isFieldVisible } from './conditions.js'
import {
  FORM_CONDITION_OPERATORS,
  FORM_FILE_CATEGORIES,
  type FormCaptchaConfig,
  type FormDefinition,
  type FormFieldDefinition,
  type FormFileValue,
  type FormNotifyChannel,
  type FormStepDefinition,
  isFormFileValue,
  type RecordedConsent,
} from './types.js'

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
  readonly values: Readonly<Record<string, string | readonly string[] | FormFileValue>>
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
): {
  readonly value: string | readonly string[] | FormFileValue | undefined
  readonly consent?: RecordedConsent
} {
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
    case 'file': {
      // The router (`@cogenta/api`'s `forms-router.ts`) is the only layer
      // that ever sees raw bytes — it resolves an uploaded multipart file
      // (or a JSON-carried value from an earlier multi-step page) into a
      // `FormFileValue` *before* calling this function. This package never
      // touches a `StorageDriver`, so all it can check here is the shape.
      if (!isFormFileValue(raw)) {
        throw invalid(field.name, 'must be a file already uploaded to this field')
      }
      return { value: raw }
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

  const values: Record<string, string | readonly string[] | FormFileValue> = {}
  const consents: RecordedConsent[] = []

  for (const field of definition.fields) {
    // Fiche 47 task 1: a field masked by an unmet `showIf` is neither
    // required nor validated — whatever was submitted under its name (if
    // anything) is silently discarded, never stored. Evaluated against the
    // *raw* submission, so it works identically with or without JavaScript
    // having toggled anything on screen.
    if (!isFieldVisible(field, rawValues)) continue

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
    if (field.kind === 'file' && field.acceptCategories !== undefined) {
      for (const category of field.acceptCategories) {
        if (!(FORM_FILE_CATEGORIES as readonly string[]).includes(category)) {
          throw new CogentaError({
            code: 'FORM_DEFINITION_INVALID',
            message: `"${category}" is not a file category.`,
            hint: `Use one of: ${FORM_FILE_CATEGORIES.join(', ')}.`,
          })
        }
      }
    }
    if (field.kind === 'file' && field.maxSizeBytes !== undefined && field.maxSizeBytes <= 0) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}" needs a positive maximum file size.`,
        hint: 'Set maxSizeBytes to a positive number of bytes, or omit it to use the default.',
      })
    }
  }

  // A second pass for `showIf`: every field name has to be known before a
  // condition can be checked against one, which is why this is not folded
  // into the loop above.
  for (const field of fields) {
    if (field.showIf === undefined) continue
    if (!(FORM_CONDITION_OPERATORS as readonly string[]).includes(field.showIf.operator)) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.showIf.operator}" is not a condition operator.`,
        hint: `Use one of: ${FORM_CONDITION_OPERATORS.join(', ')}.`,
      })
    }
    if (field.showIf.field === field.name) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}" cannot depend on its own value.`,
        hint: 'A showIf condition must name a different field.',
      })
    }
    if (!seen.has(field.showIf.field)) {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: `"${field.name}"'s condition names an unknown field "${field.showIf.field}".`,
        hint: 'showIf.field must be the name of another field on this form.',
      })
    }
  }
}

/** Task 2 — every field must belong to exactly one step when a form declares any. Absent/empty `steps` means single-page, unchecked here. */
export function validateFormSteps(
  fields: readonly FormFieldDefinition[],
  steps: readonly FormStepDefinition[],
): void {
  if (steps.length === 0) return

  const fieldNames = new Set(fields.map((field) => field.name))
  const assigned = new Set<string>()

  for (const step of steps) {
    if (step.name.trim() === '') {
      throw new CogentaError({
        code: 'FORM_STEP_INVALID',
        message: 'Every step needs a name.',
        hint: 'Give each step a short, stable identifier.',
      })
    }
    if (step.fieldNames.length === 0) {
      throw new CogentaError({
        code: 'FORM_STEP_INVALID',
        message: `Step "${step.name}" has no fields.`,
        hint: 'Every step must show at least one field.',
      })
    }
    for (const name of step.fieldNames) {
      if (!fieldNames.has(name)) {
        throw new CogentaError({
          code: 'FORM_STEP_INVALID',
          message: `Step "${step.name}" names an unknown field "${name}".`,
          hint: 'Every step field must be a real field on this form.',
        })
      }
      if (assigned.has(name)) {
        throw new CogentaError({
          code: 'FORM_STEP_INVALID',
          message: `"${name}" is assigned to more than one step.`,
          hint: 'Every field belongs to exactly one step.',
        })
      }
      assigned.add(name)
    }
  }

  for (const name of fieldNames) {
    if (!assigned.has(name)) {
      throw new CogentaError({
        code: 'FORM_STEP_INVALID',
        message: `"${name}" is not assigned to any step.`,
        hint: 'Every field must belong to exactly one step once a form declares steps.',
      })
    }
  }
}

/** Task 4 — a channel/target pair must at least be non-empty text; `@cogenta/api`'s router is what actually knows whether `channel` names a configured adapter. */
export function validateNotifyChannels(channels: readonly FormNotifyChannel[]): void {
  for (const entry of channels) {
    if (entry.channel.trim() === '' || entry.target.trim() === '') {
      throw new CogentaError({
        code: 'FORM_DEFINITION_INVALID',
        message: 'Every notification channel needs both a channel name and a target.',
        hint: 'Set both "channel" (e.g. "slack") and "target" (that channel’s own destination id).',
      })
    }
  }
}

/** Task 10 — enabling the CAPTCHA without both keys is a misconfiguration caught at save time, not at the first anonymous submission. */
export function validateCaptchaConfig(captcha: FormCaptchaConfig): void {
  if (!captcha.enabled) return
  if ((captcha.siteKey ?? '').trim() === '' || (captcha.secretKey ?? '').trim() === '') {
    throw new CogentaError({
      code: 'FORM_DEFINITION_INVALID',
      message: 'Enabling the CAPTCHA requires both a site key and a secret key.',
      hint: 'Get a Turnstile site key and secret key, or leave the CAPTCHA disabled.',
    })
  }
}
