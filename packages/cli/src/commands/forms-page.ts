import type { AccessContext } from '@cogenta/api'
import type { FormDefinition, FormFieldDefinition } from '@cogenta/forms'
import { HONEYPOT_FIELD, isFormFileValue, TIMESTAMP_FIELD } from '@cogenta/forms'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'
import { type BrandingSettings, type PageChromeMenus, renderPageChrome } from './theme-render.js'

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
}

export interface FormPageState {
  /** `?submitted=1` — the default confirmation view, when the form has no `redirectTo`. */
  readonly submitted?: boolean
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

function fieldWrapper(field: FormFieldDefinition, hasError: boolean, input: string): string {
  const id = `cg-form-field-${field.name}`
  const errorId = `${id}-error`
  return `<div class="cg-form__field">
<label for="${id}">${escapeHtmlText(labelFor(field))}</label>
${input}
${field.help !== undefined ? `<p class="cg-form__help">${escapeHtmlText(field.help)}</p>` : ''}
${hasError ? `<p id="${errorId}" class="cg-form__field-error" role="alert">This field needs your attention.</p>` : ''}
</div>`
}

function renderField(field: FormFieldDefinition, state: FormPageState): string {
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
        ? `<p class="cg-form__help">Already uploaded: ${escapeHtmlText(already.filename)}. Choose a new file only to replace it.</p>`
        : ''
      return fieldWrapper(
        field,
        hasError,
        `<input type="file" id="${id}" name="${name}"${invalid}${describedBy}>${note}`,
      )
    }
    case 'consent': {
      const isChecked = fieldValueText(state, field.name) === 'true' ? ' checked' : ''
      return `<div class="cg-form__field cg-form__field--consent">
<label><input type="checkbox" id="${id}" name="${name}" value="true"${required}${invalid}${describedBy}${isChecked}> ${escapeHtmlText(field.consentText ?? field.label)}</label>
${hasError ? `<p id="${errorId}" class="cg-form__field-error" role="alert">Consent is required to submit this form.</p>` : ''}
</div>`
    }
    default: {
      input = ''
    }
  }

  return fieldWrapper(field, hasError, input)
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

  const stepIndex = state.step ?? 0
  const { fields: stepFields, isFinalStep } = stepFieldsOf(definition, stepIndex)
  const isMultiStep = definition.steps.length > 1

  const errorBanner =
    state.errorMessage != null
      ? `<p class="cg-form__error" role="alert">${escapeHtmlText(state.errorMessage)}</p>`
      : ''

  const fields = stepFields.map((field) => renderField(field, state)).join('\n')

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

  const submitLabel = isFinalStep ? 'Send' : 'Next'

  const body = `${errorBanner}
<form class="cg-form" method="post" action="/api/forms/${encodeURIComponent(definition.name)}/submit"${needsMultipart ? ' enctype="multipart/form-data"' : ''}>
${fields}
${stepHiddenFields}
<div class="cg-form__honeypot" aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;">
<label for="cg-form-hp">Leave this field empty</label>
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
  return shell(
    'Not found',
    '<p>This form does not exist, or is not accepting submissions.</p>',
    options,
    context,
  )
}
