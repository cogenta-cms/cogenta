/**
 * Contract G (`forms@1.0`, ADR-0026): form definitions and their submissions.
 *
 * A separate domain from contract A, for the same reason ADR-0024 (commerce)
 * and ADR-0025 (comments) gave: a submission is a fact recorded, not a piece
 * of editorial content — no translation, no draft, no version, and a volume
 * and threat model (a public write route, an autoresponder that can become a
 * spam relay) contract A has no reason to carry.
 */

/** The eight field kinds ADR-0026 names. No `file` in this first version — the fiche's own recommendation, to avoid opening the upload/antivirus surface without a proven need. */
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

/** One field of a form definition. */
export interface FormFieldDefinition {
  /** Stable, used as the submission's value key. Never renamed in place by the builder — a rename is a new field, the old answers keep their old key. */
  readonly name: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required: boolean
  readonly help?: string
  /** `choiceSingle`/`choiceMulti` only — the offered values, in display order. */
  readonly choices?: readonly string[]
  /**
   * `consent` only — the exact wording shown next to the checkbox, e.g. "I
   * agree to be contacted about this enquiry." This is what gets copied,
   * verbatim and timestamped, onto every submission that ticks it (GDPR:
   * "le texte au moment du recueil compte, pas celui d'aujourd'hui").
   */
  readonly consentText?: string
}

export type FormSubmissionStatus = 'new' | 'read' | 'archived' | 'spam'

export interface AutoresponderConfig {
  readonly enabled: boolean
  readonly subject?: string
  readonly body?: string
}

export interface FormDefinition {
  readonly id: string
  /** URL-safe, unique, used in the public route and the submit endpoint (`/forms/{name}`, `POST /api/forms/{name}/submit`). */
  readonly name: string
  readonly label: string
  readonly fields: readonly FormFieldDefinition[]
  readonly active: boolean
  /** Shown on the public page after a successful submission when `redirectTo` is unset. */
  readonly confirmationMessage: string
  /** When set, a successful submission redirects here instead of showing `confirmationMessage`. */
  readonly redirectTo: string | null
  /** Where the "new submission" notification e-mail goes. Empty means no notification is sent. */
  readonly notifyEmails: readonly string[]
  readonly autoresponder: AutoresponderConfig
  /** How long a submission is kept before `purgeExpired` removes it. GDPR retention (ADR-0022's `retainDays` model, applied to submissions). */
  readonly retainDays: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateFormDefinitionInput {
  readonly name: string
  readonly label: string
  readonly fields: readonly FormFieldDefinition[]
  readonly active?: boolean
  readonly confirmationMessage?: string
  readonly redirectTo?: string | null
  readonly notifyEmails?: readonly string[]
  readonly autoresponder?: AutoresponderConfig
  readonly retainDays?: number
}

export type UpdateFormDefinitionInput = Partial<CreateFormDefinitionInput>

/** The consent actually recorded on one submission — the wording as it stood at the moment, not a live reference to the field definition. */
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
  /** sha256 of the submitting IP — never the address itself (fiche 16 acceptance criterion: "Aucune adresse IP en clair"). */
  readonly ipHash: string | null
  readonly referrer: string | null
  readonly userAgent: string | null
  readonly submittedAt: string
}

/** The one string value most forms actually collect an e-mail through, for the GDPR search (fiche 16 task 7's minimum: "une recherche par e-mail"). */
export function emailValueOf(
  submission: FormSubmission,
  fields: readonly FormFieldDefinition[],
): string | null {
  const emailField = fields.find((field) => field.kind === 'email')
  if (emailField === undefined) return null
  const value = submission.values[emailField.name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : null
}
