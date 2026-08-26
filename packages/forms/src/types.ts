/**
 * Contract G (`forms@1.0`, ADR-0026): form definitions and their submissions.
 *
 * A separate domain from contract A, for the same reason ADR-0024 (commerce)
 * and ADR-0025 (comments) gave: a submission is a fact recorded, not a piece
 * of editorial content — no translation, no draft, no version, and a volume
 * and threat model (a public write route, an autoresponder that can become a
 * spam relay) contract A has no reason to carry.
 */

/**
 * The ten field kinds contract G now names. `file` was ADR-0026's own
 * deliberate renoncement ("pour éviter d'ouvrir la surface upload/antivirus
 * sans besoin prouvé") — reopened on 2026-08-26, in direct conversation with
 * the human, once it became a named, chiffré task (fiche 47 §8): a
 * documented change of position on a contract that is acted but not figured
 * (ADR-0026), not a fresh ADR in the strict sense.
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

/** The operators fiche 47 task 1's conditional logic offers — deliberately small: a visibility gate, not a rules engine. */
export const FORM_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'isEmpty',
  'isNotEmpty',
] as const
export type FormConditionOperator = (typeof FORM_CONDITION_OPERATORS)[number]

/**
 * "Un champ conditionnel n'apparaît, n'est requis et n'est validé que si sa
 * condition est remplie" (fiche 47 §5) — evaluated against another field's
 * own *raw, submitted* value, server-side, on every submission. `value` is
 * unused (and ignored) for `isEmpty`/`isNotEmpty`.
 */
export interface FormFieldCondition {
  /** The name of the field this condition reads. Must be a different field on the same form (checked at definition time, `validateDefinitionFields`). */
  readonly field: string
  readonly operator: FormConditionOperator
  readonly value?: string
}

/** The file categories a `file` field can be restricted to — closed vocabulary, sniffed from bytes, never trusted from a filename or declared MIME type. See `file-field.ts`. */
export const FORM_FILE_CATEGORIES = ['image', 'pdf', 'document', 'text'] as const
export type FormFileCategory = (typeof FORM_FILE_CATEGORIES)[number]

/** What a validated `file` field answer actually stores — never the bytes themselves (those live in a `StorageDriver`, addressed by `storageKey`, exactly like `@cogenta/core`'s media pipeline). */
export interface FormFileValue {
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly storageKey: string
}

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
  /** Task 1 — when set, this field is only required/validated when the condition holds against the rest of the submission. Absent means always visible, the pre-fiche-47 behaviour. */
  readonly showIf?: FormFieldCondition
  /** `file` only — restricts which sniffed byte categories this field accepts. Absent means every category in `FORM_FILE_CATEGORIES`. */
  readonly acceptCategories?: readonly FormFileCategory[]
  /** `file` only — overrides `DEFAULT_FORM_FILE_MAX_BYTES`, itself capped by `FORM_FILE_HARD_MAX_BYTES` regardless of what is configured here. */
  readonly maxSizeBytes?: number
}

/**
 * Task 2 — one page of a multi-step form. Every field must belong to exactly
 * one step (checked by `validateDefinitionFields`); steps render as chained
 * `<form>`s with no client framework. Real validation is deferred to the
 * final step's submit — see `forms-router.ts` — so a partial, in-progress
 * multi-step fill is never itself checked against required-ness.
 */
export interface FormStepDefinition {
  readonly name: string
  readonly label: string
  readonly fieldNames: readonly string[]
}

/**
 * Task 4 — one extra channel a submission is announced on, beyond
 * `notifyEmails`. `channel` names an adapter already configured in this
 * site's `ChannelRegistry` (e.g. `slack`/`discord`/`telegram`/`webhook`);
 * `target` is that adapter's own target id (a Slack/Discord channel id, a
 * Telegram chat id, a webhook URL) — opaque to this package, exactly as
 * `ChannelTarget.id` already is to `@cogenta/channels` itself.
 */
export interface FormNotifyChannel {
  readonly channel: string
  readonly target: string
}

/**
 * Task 10 — CAPTCHA, optional per form, Cloudflare Turnstile only (a single
 * HTTP verification call — R9: no client SDK dependency this package pulls
 * in). Never on by default (fiche 47 § pièges: "un CAPTCHA ne doit jamais
 * devenir obligatoire par défaut").
 */
export interface FormCaptchaConfig {
  readonly enabled: boolean
  readonly siteKey?: string
  readonly secretKey?: string
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
  /** Task 2 — absent or empty means single-page, the pre-fiche-47 behaviour. */
  readonly steps: readonly FormStepDefinition[]
  /** Task 4 — extra channels a submission is announced on, beyond `notifyEmails`. */
  readonly notifyChannels: readonly FormNotifyChannel[]
  /** Task 10 — off by default (`enabled: false`), per fiche § pièges. */
  readonly captcha: FormCaptchaConfig
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
  readonly steps?: readonly FormStepDefinition[]
  readonly notifyChannels?: readonly FormNotifyChannel[]
  readonly captcha?: FormCaptchaConfig
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
  readonly values: Readonly<Record<string, string | readonly string[] | FormFileValue>>
  readonly consents: readonly RecordedConsent[]
  readonly status: FormSubmissionStatus
  /** sha256 of the submitting IP — never the address itself (fiche 16 acceptance criterion: "Aucune adresse IP en clair"). */
  readonly ipHash: string | null
  readonly referrer: string | null
  readonly userAgent: string | null
  readonly submittedAt: string
}

/** Task 8 — an operator's own note on a submission, never shown to the visitor, never exported. */
export interface FormSubmissionNote {
  readonly id: string
  readonly submissionId: string
  readonly authorId: string | null
  readonly authorLabel: string
  readonly body: string
  readonly createdAt: string
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
