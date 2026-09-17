import type { AccessContext } from '@cogenta/api'
import type { FormDefinition, FormFieldDefinition } from '@cogenta/forms'
import { HONEYPOT_FIELD, isFormFileValue, TIMESTAMP_FIELD } from '@cogenta/forms'
import type { MediaAsset } from '@cogenta/render'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'
import type { WidgetAreas } from '@cogenta/theme-kit'
import type { SeoRenderDefaults } from './seo.js'
import {
  type BrandingSettings,
  type ChromeExtras,
  type PageChromeMenus,
  renderPageChrome,
  type SiteIdentityMedia,
} from './theme-render.js'

/**
 * `GET /forms/{name}` — the "route dédiée" ADR-0026 chose over a contract B
 * block for a form's first arrival on a page (a bloc `form` RFC is left open
 * in parallel, per the ADR). Modelled directly on `search-page.ts`: real,
 * server-rendered HTML, no client framework, styled by the same joined
 * skin+theme stylesheet every other public page uses.
 *
 * The one thing this file must get right that `search-page.ts` never had to:
 * re-displaying a **failed** submission's own values and per-field errors
 * accessibly (`aria-invalid`, `aria-describedby`) — fiche 16's own
 * acceptance criterion, "une saisie refusée n'efface pas ce que le visiteur
 * a tapé". `createRequestListener` (`serve.ts`) calls `renderFormPage` again
 * with the just-submitted values whenever `POST /api/forms/{name}/submit`
 * answers anything but success.
 *
 * Fiche 47 adds multi-step (task 2) without a single line of client
 * JavaScript: each step is its own `<form method="post">` POSTing to the
 * exact same submit endpoint, carrying everything answered so far forward
 * as one hidden `_accumulated` JSON field plus the original page-load
 * timestamp (`_ts`, never refreshed step to step — `checkFillDelay` in
 * `@cogenta/forms` needs it to stay meaningful across the whole flow).
 * `serve.ts` is what decides, from the router's own response, whether to
 * render the next step or the confirmation/error view — this file only ever
 * renders one page at a time and never itself decides what "next" means.
 */

/**
 * What a visitor reads around a form's own fields, in the site's language.
 * The labels, choices and confirmation are the form author's; these are the
 * page's (L36 audit: a French site's form said "Send" and relayed the API's
 * English refusals verbatim).
 */
interface FormPageStrings {
  readonly send: string
  readonly next: string
  readonly honeypot: string
  readonly fieldError: string
  readonly consentRequired: string
  readonly alreadyUploaded: string
  readonly notFoundTitle: string
  readonly notFoundBody: string
  readonly errors: Readonly<Record<string, string>>
  readonly errorFallback: string
}

const FORM_PAGE_STRINGS: Readonly<Record<'en' | 'fr', FormPageStrings>> = {
  en: {
    send: 'Send',
    next: 'Next',
    honeypot: 'Leave this field empty',
    fieldError: 'This field needs your attention.',
    consentRequired: 'Consent is required to submit this form.',
    alreadyUploaded: 'Already uploaded: {filename}. Choose a new file only to replace it.',
    notFoundTitle: 'Not found',
    notFoundBody: 'This form does not exist, or is not accepting submissions.',
    errors: {
      FORM_SUBMISSION_INVALID: 'Some answers need your attention: check the fields marked below.',
      FORM_CONSENT_REQUIRED: 'Consent is required to submit this form.',
      FORM_FILE_REJECTED: 'This file cannot be accepted: check its type and size.',
      FORM_RATE_LIMITED: 'Too many submissions in a short time: please try again in a few minutes.',
      FORM_CAPTCHA_REQUIRED: 'Please complete the verification before sending.',
      FORM_CAPTCHA_FAILED: 'The verification did not succeed: please try again.',
      FORM_DISABLED: 'This form is not accepting submissions at the moment.',
    },
    errorFallback: 'Your answers could not be sent. Please try again in a moment.',
  },
  fr: {
    send: 'Envoyer',
    next: 'Suivant',
    honeypot: 'Laissez ce champ vide',
    fieldError: 'Ce champ demande votre attention.',
    consentRequired: 'Votre consentement est nécessaire pour envoyer ce formulaire.',
    alreadyUploaded:
      'Fichier déjà envoyé : {filename}. N’en choisissez un autre que pour le remplacer.',
    notFoundTitle: 'Introuvable',
    notFoundBody: 'Ce formulaire n’existe pas, ou n’accepte plus de réponses.',
    errors: {
      FORM_SUBMISSION_INVALID: 'Certaines réponses sont à revoir : vérifiez les champs signalés.',
      FORM_CONSENT_REQUIRED: 'Votre consentement est nécessaire pour envoyer ce formulaire.',
      FORM_FILE_REJECTED: 'Ce fichier ne peut pas être accepté : vérifiez son type et sa taille.',
      FORM_RATE_LIMITED: 'Trop d’envois à la suite : réessayez dans quelques minutes.',
      FORM_CAPTCHA_REQUIRED: 'Merci de compléter la vérification avant d’envoyer.',
      FORM_CAPTCHA_FAILED: 'La vérification n’a pas abouti : réessayez.',
      FORM_DISABLED: 'Ce formulaire n’accepte pas de réponses pour le moment.',
    },
    errorFallback: 'Vos réponses n’ont pas pu être envoyées. Réessayez dans un instant.',
  },
}

function formPageStrings(locale: string): FormPageStrings {
  return locale.toLowerCase().startsWith('fr') ? FORM_PAGE_STRINGS.fr : FORM_PAGE_STRINGS.en
}

export interface FormPageSite {
  readonly name: string
  readonly url: string
  readonly defaultLocale: string
}

export interface FormPageOptions {
  readonly site: FormPageSite
  /** `null` when neither the skin nor the theme stylesheet could be loaded. */
  readonly styles: string | null
  readonly now: () => number
  /** Same menu wiring the rest of the public site uses (`theme-render.ts`). Absent renders an empty header/footer nav, exactly as before this page had any chrome at all. */
  readonly menus?: PageChromeMenus
  /** Same live branding read the rest of the public site uses (`theme-render.ts`). Absent means full Cogenta credit. */
  readonly branding?: () => Promise<BrandingSettings>
  /** Same live active-theme read the rest of the public site uses (`theme-render.ts`). Absent renders with the default theme. */
  readonly activeTheme?: () => Promise<string | null>
  /** Same live SEO settings read the rest of the public site uses (`theme-render.ts`) — only the search-verification meta tags apply here (fiche 50 task 2). */
  readonly seo?: () => Promise<SeoRenderDefaults>
  /** Same live site-identity read every other public page uses (audit T01) — the logo and favicon belong on this page too. */
  readonly identity?: () => Promise<SiteIdentityMedia>
  /** Same batch media loader (`theme-render.ts`). Needed only to resolve the identity above; absent means the site name in text. */
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, MediaAsset>>
  /** The tagline, social links and footer note every other public page carries (contract D `theme@1.4`). Absent renders the chrome without them. */
  readonly chromeExtras?: (locale: string) => Promise<ChromeExtras>
  /** Widget areas already resolved for this page (L30). */
  readonly widgets?: WidgetAreas
}

export interface FormPageState {
  /** `?submitted=1` — the default confirmation view, when the form has no `redirectTo`. */
  readonly submitted?: boolean
  /**
   * The refusal's error code (`FORM_*`), which picks the message the visitor
   * reads in the site's language. A tripped honeypot or a form sent too fast
   * reads as the generic message: naming it would teach a bot what tripped.
   */
  readonly errorCode?: string | null
  /** A message to show as is, when there is no code to translate. */
  readonly errorMessage?: string | null
  readonly errorField?: string | null
  /** The visitor's own values, from the request that just failed (or that a step just answered) — never lost. */
  readonly values?: Readonly<Record<string, unknown>>
  /** Task 2 — the step to render, 0-based. Absent means step 0 (or the only page, for a single-page form). */
  readonly step?: number
  /** Task 2 — everything answered on earlier steps, carried forward verbatim as the next request's `_accumulated`. */
  readonly accumulated?: Readonly<Record<string, unknown>>
  /** Task 2 — the original page-load timestamp; re-emitted unchanged rather than refreshed to `options.now()` once a flow is under way. */
  readonly ts?: string
}

function labelFor(field: FormFieldDefinition): string {
  return field.label + (field.required ? ' *' : '')
}

function fieldValueText(state: FormPageState, name: string): string {
  const raw = state.values?.[name]
  if (Array.isArray(raw)) return raw.join(', ')
  return typeof raw === 'string' ? raw : ''
}

function checkedValues(state: FormPageState, name: string): readonly string[] {
  const raw = state.values?.[name]
  if (Array.isArray(raw)) return raw.map(String)
  return typeof raw === 'string' && raw !== '' ? [raw] : []
}

function fieldHasError(state: FormPageState, field: FormFieldDefinition): boolean {
  return state.errorField === field.name
}

function fieldWrapper(
  field: FormFieldDefinition,
  hasError: boolean,
  input: string,
  strings: FormPageStrings,
): string {
  const id = `cg-form-field-${field.name}`
  const errorId = `${id}-error`
  return `<div class="cg-form__field">
<label for="${id}">${escapeHtmlText(labelFor(field))}</label>
${input}
${field.help !== undefined ? `<p class="cg-form__help">${escapeHtmlText(field.help)}</p>` : ''}
${hasError ? `<p id="${errorId}" class="cg-form__field-error" role="alert">${escapeHtmlText(strings.fieldError)}</p>` : ''}
</div>`
}

function renderField(
  field: FormFieldDefinition,
  state: FormPageState,
  strings: FormPageStrings,
): string {
  const hasError = fieldHasError(state, field)
  const id = `cg-form-field-${field.name}`
  const errorId = `${id}-error`
  const describedBy = hasError ? ` aria-describedby="${errorId}"` : ''
  const invalid = ` aria-invalid="${hasError ? 'true' : 'false'}"`
  const required = field.required ? ' required' : ''
  const name = escapeHtmlAttribute(field.name)

  let input: string
  switch (field.kind) {
    case 'text':
    case 'email':
    case 'phone':
    case 'date': {
      const type =
        field.kind === 'email'
          ? 'email'
          : field.kind === 'phone'
            ? 'tel'
            : field.kind === 'date'
              ? 'date'
              : 'text'
      input = `<input type="${type}" id="${id}" name="${name}"${required}${invalid}${describedBy} value="${escapeHtmlAttribute(fieldValueText(state, field.name))}">`
      break
    }
    case 'number': {
      input = `<input type="number" id="${id}" name="${name}"${required}${invalid}${describedBy} value="${escapeHtmlAttribute(fieldValueText(state, field.name))}">`
      break
    }
    case 'longText': {
      input = `<textarea id="${id}" name="${name}"${required}${invalid}${describedBy} rows="5">${escapeHtmlText(fieldValueText(state, field.name))}</textarea>`
      break
    }
    case 'choiceSingle': {
      const options = (field.choices ?? [])
        .map((choice) => {
          const selected = fieldValueText(state, field.name) === choice ? ' selected' : ''
          return `<option value="${escapeHtmlAttribute(choice)}"${selected}>${escapeHtmlText(choice)}</option>`
        })
        .join('')
      input = `<select id="${id}" name="${name}"${required}${invalid}${describedBy}><option value="">—</option>${options}</select>`
      break
    }
    case 'choiceMulti': {
      const checked = checkedValues(state, field.name)
      input = (field.choices ?? [])
        .map((choice, index) => {
          const choiceId = `${id}-${index}`
          const isChecked = checked.includes(choice) ? ' checked' : ''
          return `<label class="cg-form__choice"><input type="checkbox" id="${choiceId}" name="${name}" value="${escapeHtmlAttribute(choice)}"${isChecked}> ${escapeHtmlText(choice)}</label>`
        })
        .join('')
      break
    }
    case 'file': {
      // Fiche 47 task 3. A file input can never be pre-filled by a server
      // (browsers refuse it, for good reason) — the best this can do on
      // redisplay is say what is already on file, from a value already
      // resolved to a `FormFileValue` (carried forward via `_accumulated`,
      // or accepted earlier in this very flow before another field failed).
      const already = state.values?.[field.name]
      const note = isFormFileValue(already)
        ? `<p class="cg-form__help">${escapeHtmlText(strings.alreadyUploaded.replace('{filename}', already.filename))}</p>`
        : ''
      return fieldWrapper(
        field,
        hasError,
        `<input type="file" id="${id}" name="${name}"${invalid}${describedBy}>${note}`,
        strings,
      )
    }
    case 'consent': {
      const isChecked = fieldValueText(state, field.name) === 'true' ? ' checked' : ''
      return `<div class="cg-form__field cg-form__field--consent">
<label><input type="checkbox" id="${id}" name="${name}" value="true"${required}${invalid}${describedBy}${isChecked}> ${escapeHtmlText(field.consentText ?? field.label)}</label>
${hasError ? `<p id="${errorId}" class="cg-form__field-error" role="alert">${escapeHtmlText(strings.consentRequired)}</p>` : ''}
</div>`
    }
    default: {
      input = ''
    }
  }

  return fieldWrapper(field, hasError, input, strings)
}

function confirmationPage(
  definition: FormDefinition,
  options: FormPageOptions,
  context: AccessContext,
): Promise<string> {
  return shell(
    definition.label,
    `<div class="cg-form__confirmation" role="status"><p>${escapeHtmlText(definition.confirmationMessage)}</p></div>`,
    options,
    context,
  )
}

/**
 * The real site chrome (`renderPageChrome`, `theme-render.ts`) — the same
 * skip link, header and footer every collection page renders, not a second,
 * thinner `<html>` shell of this file's own (L20 audit, points 8-9).
 */
async function shell(
  title: string,
  body: string,
  options: FormPageOptions,
  context: AccessContext,
): Promise<string> {
  return renderPageChrome(
    {
      site: options.site,
      locale: options.site.defaultLocale,
      styles: options.styles,
      headHtml: `<title>${escapeHtmlText(title)} — ${escapeHtmlText(options.site.name)}</title>`,
      bodyHtml: `<main class="cg-main" id="cg-main">
<h1 class="cg-page__title">${escapeHtmlText(title)}</h1>
${body}
</main>`,
      ...(options.menus === undefined ? {} : { menus: options.menus }),
      ...(options.branding === undefined ? {} : { branding: options.branding }),
      ...(options.activeTheme === undefined ? {} : { activeTheme: options.activeTheme }),
      ...(options.seo === undefined ? {} : { seo: options.seo }),
      ...(options.identity === undefined ? {} : { identity: options.identity }),
      ...(options.loadMedia === undefined ? {} : { loadMedia: options.loadMedia }),
      ...(options.chromeExtras === undefined ? {} : { chromeExtras: options.chromeExtras }),
      ...(options.widgets === undefined ? {} : { widgets: options.widgets }),
    },
    context,
  )
}

function stepFieldsOf(
  definition: FormDefinition,
  stepIndex: number,
): { readonly fields: readonly FormFieldDefinition[]; readonly isFinalStep: boolean } {
  const stepsCount = definition.steps.length
  if (stepsCount <= 1) return { fields: definition.fields, isFinalStep: true }

  const clamped = Math.min(Math.max(stepIndex, 0), stepsCount - 1)
  const step = definition.steps[clamped]
  const names = new Set(step?.fieldNames ?? [])
  return {
    fields: definition.fields.filter((field) => names.has(field.name)),
    isFinalStep: clamped >= stepsCount - 1,
  }
}

/**
 * The whole page: the form itself (one step of it, for a multi-step form),
 * or its confirmation view under `?submitted=1` when the form has no
 * `redirectTo` of its own.
 */
export function renderFormPage(
  definition: FormDefinition,
  state: FormPageState,
  options: FormPageOptions,
  context: AccessContext,
): Promise<string> {
  if (state.submitted === true) return confirmationPage(definition, options, context)
  const strings = formPageStrings(options.site.defaultLocale)

  const stepIndex = state.step ?? 0
  const { fields: stepFields, isFinalStep } = stepFieldsOf(definition, stepIndex)
  const isMultiStep = definition.steps.length > 1

  const errorText =
    state.errorCode != null
      ? (strings.errors[state.errorCode] ?? strings.errorFallback)
      : state.errorMessage
  const errorBanner =
    errorText != null
      ? `<p class="cg-form__error" role="alert">${escapeHtmlText(errorText)}</p>`
      : ''

  const fields = stepFields.map((field) => renderField(field, state, strings)).join('\n')

  const ts = state.ts ?? String(options.now())
  const needsMultipart = stepFields.some((field) => field.kind === 'file')

  const stepHiddenFields = isMultiStep
    ? `<input type="hidden" name="_step" value="${stepIndex}">
<input type="hidden" name="_accumulated" value="${escapeHtmlAttribute(JSON.stringify(state.accumulated ?? {}))}">`
    : ''

  const captcha =
    isFinalStep && definition.captcha.enabled
      ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="${escapeHtmlAttribute(definition.captcha.siteKey ?? '')}"></div>`
      : ''

  const submitLabel = escapeHtmlText(isFinalStep ? strings.send : strings.next)

  const body = `${errorBanner}
<form class="cg-form" method="post" action="/api/forms/${encodeURIComponent(definition.name)}/submit"${needsMultipart ? ' enctype="multipart/form-data"' : ''}>
${fields}
${stepHiddenFields}
<div class="cg-form__honeypot" aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;">
<label for="cg-form-hp">${escapeHtmlText(strings.honeypot)}</label>
<input type="text" id="cg-form-hp" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off" value="">
</div>
<input type="hidden" name="${TIMESTAMP_FIELD}" value="${escapeHtmlAttribute(ts)}">
${captcha}
<button type="submit">${submitLabel}</button>
</form>`

  return shell(definition.label, body, options, context)
}

export function renderFormNotFoundPage(
  options: FormPageOptions,
  context: AccessContext,
): Promise<string> {
  const strings = formPageStrings(options.site.defaultLocale)
  return shell(
    strings.notFoundTitle,
    `<p>${escapeHtmlText(strings.notFoundBody)}</p>`,
    options,
    context,
  )
}
