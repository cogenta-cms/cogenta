import { type JSX, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  createForm,
  deleteForm,
  duplicateForm,
  FORM_CONDITION_OPERATORS,
  FORM_FIELD_KINDS,
  type FormCaptchaConfig,
  type FormConditionOperator,
  type FormDefinition,
  type FormFieldDefinition,
  type FormFieldKind,
  type FormNotifyChannel,
  type FormStepDefinition,
  listForms,
  updateForm,
} from '../api/forms-client.js'
import { useAuth } from '../auth/auth-context.js'
import type { ItemFieldDefinition } from '../blocks/vocabulary.js'
import { RepeaterField } from '../fields/repeater-field.js'
import { slugify } from '../lib/slugify.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * Fiche 16 task 2 (base) + fiche 47 tasks 1-3 — the form builder. Reuses
 * `RepeaterField` (fiche 03 task 2) for the list of fields rather than a
 * second repeater component: a form's field list is exactly the same shape
 * a block's `f.list(...)` is — an ordered, add/remove/reorder list of small
 * typed rows — the builder's only job is to describe *what one row looks
 * like*.
 *
 * Conditional logic (`showIf`) and steps are edited as plain per-row text
 * rather than a second visual graph/wizard builder — deliberately: this
 * screen was already brutish-but-honest for every other property (ADR-0026's
 * own choice), and a field referencing another field by name is no harder to
 * type correctly than a choice list already is. `step` is a free-text label:
 * every row sharing the same non-empty `step` becomes one step, in the order
 * rows first introduce a new step name.
 */

const NO_CONDITION = '' as const

const FIELD_EDITOR_ITEMS: readonly ItemFieldDefinition[] = [
  { name: 'name', kind: 'text', required: true, localized: false, options: {} },
  { name: 'label', kind: 'text', required: true, localized: false, options: {} },
  {
    name: 'kind',
    kind: 'select',
    required: true,
    localized: false,
    options: { options: FORM_FIELD_KINDS.map((value) => ({ value })) },
  },
  { name: 'required', kind: 'boolean', required: false, localized: false, options: {} },
  { name: 'help', kind: 'text', required: false, localized: false, options: {} },
  {
    name: 'choicesText',
    kind: 'text',
    required: false,
    localized: false,
    options: {},
    visibleWhen: { field: 'kind', equals: ['choiceSingle', 'choiceMulti'] },
  },
  {
    name: 'consentText',
    kind: 'text',
    required: false,
    localized: false,
    options: {},
    visibleWhen: { field: 'kind', equals: ['consent'] },
  },
  { name: 'step', kind: 'text', required: false, localized: false, options: {} },
  { name: 'showIfField', kind: 'text', required: false, localized: false, options: {} },
  {
    name: 'showIfOperator',
    kind: 'select',
    required: false,
    localized: false,
    options: {
      options: [{ value: NO_CONDITION }, ...FORM_CONDITION_OPERATORS.map((value) => ({ value }))],
    },
  },
  { name: 'showIfValue', kind: 'text', required: false, localized: false, options: {} },
  {
    name: 'acceptCategoriesText',
    kind: 'text',
    required: false,
    localized: false,
    options: {},
    visibleWhen: { field: 'kind', equals: ['file'] },
  },
  {
    name: 'maxSizeBytes',
    kind: 'text',
    required: false,
    localized: false,
    options: {},
    visibleWhen: { field: 'kind', equals: ['file'] },
  },
]

interface FieldEditorRow {
  readonly name: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required?: boolean
  readonly help?: string
  readonly choicesText?: string
  readonly consentText?: string
  readonly step?: string
  readonly showIfField?: string
  readonly showIfOperator?: FormConditionOperator | typeof NO_CONDITION
  readonly showIfValue?: string
  readonly acceptCategoriesText?: string
  readonly maxSizeBytes?: string
  readonly _key?: string
}

function rowsFromFields(fields: readonly FormFieldDefinition[]): FieldEditorRow[] {
  return fields.map((field) => ({
    name: field.name,
    label: field.label,
    kind: field.kind,
    required: field.required,
    help: field.help ?? '',
    choicesText: (field.choices ?? []).join(', '),
    consentText: field.consentText ?? '',
    step: '',
    showIfField: field.showIf?.field ?? '',
    showIfOperator: field.showIf?.operator ?? NO_CONDITION,
    showIfValue: field.showIf?.value ?? '',
    acceptCategoriesText: (field.acceptCategories ?? []).join(', '),
    maxSizeBytes: field.maxSizeBytes !== undefined ? String(field.maxSizeBytes) : '',
  }))
}

/** Reattaches `step` from the definition's own `steps` list — `rowsFromFields` above cannot know it (a field only knows its own name), so this is applied once, right after loading an existing form into the draft. */
function withStepColumn(
  rows: readonly FieldEditorRow[],
  steps: readonly FormStepDefinition[],
): FieldEditorRow[] {
  if (steps.length === 0) return [...rows]
  const stepByField = new Map<string, string>()
  for (const step of steps) {
    for (const name of step.fieldNames) stepByField.set(name, step.name)
  }
  return rows.map((row) => ({ ...row, step: stepByField.get(row.name) ?? '' }))
}

function fieldsFromRows(rows: readonly FieldEditorRow[]): readonly FormFieldDefinition[] {
  return rows.map((row) => ({
    name: row.name.trim(),
    label: row.label.trim(),
    kind: row.kind,
    required: row.required === true,
    ...(row.help !== undefined && row.help.trim() !== '' ? { help: row.help.trim() } : {}),
    ...(row.kind === 'choiceSingle' || row.kind === 'choiceMulti'
      ? {
          choices: (row.choicesText ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value !== ''),
        }
      : {}),
    ...(row.kind === 'consent' && row.consentText !== undefined && row.consentText.trim() !== ''
      ? { consentText: row.consentText.trim() }
      : {}),
    ...(row.showIfField !== undefined &&
    row.showIfField.trim() !== '' &&
    row.showIfOperator !== undefined &&
    row.showIfOperator !== NO_CONDITION
      ? {
          showIf: {
            field: row.showIfField.trim(),
            operator: row.showIfOperator,
            ...(row.showIfValue !== undefined && row.showIfValue.trim() !== ''
              ? { value: row.showIfValue.trim() }
              : {}),
          },
        }
      : {}),
    ...(row.kind === 'file' &&
    row.acceptCategoriesText !== undefined &&
    row.acceptCategoriesText.trim() !== ''
      ? {
          acceptCategories: row.acceptCategoriesText
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value !== '') as readonly NonNullable<
            FormFieldDefinition['acceptCategories']
          >[number][],
        }
      : {}),
    ...(row.kind === 'file' && row.maxSizeBytes !== undefined && row.maxSizeBytes.trim() !== ''
      ? { maxSizeBytes: Number(row.maxSizeBytes) }
      : {}),
  }))
}

/** Groups rows by their `step` text into `FormStepDefinition[]`, in first-appearance order. Rows with a blank `step` are simply not part of any step — a single-page form when every row leaves it blank. */
function stepsFromRows(rows: readonly FieldEditorRow[]): readonly FormStepDefinition[] {
  const order: string[] = []
  const fieldNamesByStep = new Map<string, string[]>()
  for (const row of rows) {
    const step = (row.step ?? '').trim()
    if (step === '') continue
    if (!fieldNamesByStep.has(step)) {
      fieldNamesByStep.set(step, [])
      order.push(step)
    }
    fieldNamesByStep.get(step)?.push(row.name.trim())
  }
  return order.map((name) => ({ name, label: name, fieldNames: fieldNamesByStep.get(name) ?? [] }))
}

function parseNotifyChannels(text: string): readonly FormNotifyChannel[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [channel, ...rest] = line.split(':')
      return { channel: (channel ?? '').trim(), target: rest.join(':').trim() }
    })
    .filter((entry) => entry.channel !== '' && entry.target !== '')
}

function notifyChannelsToText(channels: readonly FormNotifyChannel[]): string {
  return channels.map((entry) => `${entry.channel}:${entry.target}`).join('\n')
}

interface DraftState {
  readonly id: string | null
  readonly name: string
  readonly label: string
  readonly rows: readonly FieldEditorRow[]
  readonly active: boolean
  readonly confirmationMessage: string
  readonly redirectTo: string
  readonly notifyEmailsText: string
  readonly autoresponderEnabled: boolean
  readonly autoresponderBody: string
  readonly retainDays: string
  /** Task 4 — one "channel:target" pair per line. */
  readonly notifyChannelsText: string
  /** Task 10 — off by default, per fiche § pièges. */
  readonly captchaEnabled: boolean
  readonly captchaSiteKey: string
  readonly captchaSecretKey: string
}

const BLANK_DRAFT: DraftState = {
  id: null,
  name: '',
  label: '',
  rows: [],
  active: true,
  confirmationMessage: 'Thank you — your message has been received.',
  redirectTo: '',
  notifyEmailsText: '',
  autoresponderEnabled: false,
  autoresponderBody: '',
  retainDays: '180',
  notifyChannelsText: '',
  captchaEnabled: false,
  captchaSiteKey: '',
  captchaSecretKey: '',
}

function draftFromForm(form: FormDefinition): DraftState {
  return {
    id: form.id,
    name: form.name,
    label: form.label,
    rows: withStepColumn(rowsFromFields(form.fields), form.steps),
    active: form.active,
    confirmationMessage: form.confirmationMessage,
    redirectTo: form.redirectTo ?? '',
    notifyEmailsText: form.notifyEmails.join(', '),
    autoresponderEnabled: form.autoresponder.enabled,
    autoresponderBody: form.autoresponder.body ?? '',
    retainDays: String(form.retainDays),
    notifyChannelsText: notifyChannelsToText(form.notifyChannels),
    captchaEnabled: form.captcha.enabled,
    captchaSiteKey: form.captcha.siteKey ?? '',
    captchaSecretKey: form.captcha.secretKey ?? '',
  }
}

export function FormsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [forms, setForms] = useState<readonly FormDefinition[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  // Only meaningful for a brand-new form (`draft.id === null`): once the
  // admin edits "Name" directly, typing in "Label" must stop overwriting it —
  // the same rule the taxonomy quick-create control and the product create
  // modal already follow for their own identifier field. Reset whenever a
  // draft is (re)opened, below.
  const [nameTouched, setNameTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const headingId = useId()

  const load = useCallback(async () => {
    if (token === null) return
    try {
      setForms(await listForms(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('forms.loadError'))
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  if (!isAdmin) {
    return (
      <section aria-labelledby={headingId}>
        <h1 id={headingId}>{t('forms.heading')}</h1>
        <p role="alert">{t('forms.adminOnly')}</p>
      </section>
    )
  }

  async function save(): Promise<void> {
    if (token === null || draft === null) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const wasNew = draft.id === null
    try {
      const notifyEmails = draft.notifyEmailsText
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '')
      const captcha: FormCaptchaConfig = draft.captchaEnabled
        ? {
            enabled: true,
            siteKey: draft.captchaSiteKey.trim(),
            secretKey: draft.captchaSecretKey.trim(),
          }
        : { enabled: false }
      const input = {
        name: draft.name,
        label: draft.label,
        fields: fieldsFromRows(draft.rows),
        active: draft.active,
        confirmationMessage: draft.confirmationMessage,
        redirectTo: draft.redirectTo.trim() === '' ? null : draft.redirectTo.trim(),
        notifyEmails,
        autoresponder: { enabled: draft.autoresponderEnabled, body: draft.autoresponderBody },
        retainDays: Number(draft.retainDays) || 180,
        steps: stepsFromRows(draft.rows),
        notifyChannels: parseNotifyChannels(draft.notifyChannelsText),
        captcha,
      }
      if (wasNew) await createForm(token, input)
      else await updateForm(token, draft.id as string, input)
      setDraft(null)
      setNotice(
        wasNew
          ? t('forms.createSuccess', { label: input.label })
          : t('forms.saveSuccess', { label: input.label }),
      )
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('forms.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string): Promise<void> {
    if (token === null) return
    try {
      await deleteForm(token, id)
      setConfirmDeleteId(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('forms.deleteError'))
    }
  }

  /** Task 11 — a real, independent, inactive copy (never a template that must be renamed before anything works). */
  async function duplicate(id: string): Promise<void> {
    if (token === null) return
    try {
      const copy = await duplicateForm(token, id)
      setNotice(t('forms.duplicateSuccess', { label: copy.label }))
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('forms.duplicateError'))
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 id={headingId} className="m-0 text-xl leading-7 font-semibold">
            {t('forms.heading')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('forms.description')}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setNameTouched(false)
            setNotice(null)
            setDraft(BLANK_DRAFT)
          }}
        >
          {t('forms.newForm')}
        </Button>
      </div>

      {notice !== null && (
        <Notice tone="success" live="polite">
          <p>{notice}</p>
        </Notice>
      )}
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {draft !== null ? (
        <FormEditor
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void save()}
          saving={saving}
          nameTouched={nameTouched}
          onNameTouched={() => setNameTouched(true)}
        />
      ) : forms === null ? (
        <p>{t('common.loading')}</p>
      ) : (
        <TableRoot label={t('forms.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('forms.columnLabel')}</TableHeader>
                <TableHeader>{t('forms.columnName')}</TableHeader>
                <TableHeader>{t('forms.columnFields')}</TableHeader>
                <TableHeader>{t('forms.columnActive')}</TableHeader>
                <TableHeader>{t('forms.columnActions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {forms.length === 0 && <TableEmpty colSpan={5}>{t('forms.empty')}</TableEmpty>}
              {forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell className="font-medium">{form.label}</TableCell>
                  <TableCell className="font-mono text-xs">{form.name}</TableCell>
                  <TableCell>{form.fields.length}</TableCell>
                  <TableCell>{form.active ? t('forms.active') : t('forms.inactive')}</TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setNameTouched(true)
                        setNotice(null)
                        setDraft(draftFromForm(form))
                      }}
                    >
                      {t('forms.edit')}
                    </Button>
                    <Link to={`/form-submissions?formId=${form.id}`}>
                      <Button type="button" size="sm" variant="secondary">
                        {t('forms.viewSubmissions')}
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void duplicate(form.id)}
                    >
                      {t('forms.duplicate')}
                    </Button>
                    {confirmDeleteId === form.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void remove(form.id)}
                        >
                          {t('forms.confirmDelete')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t('common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(form.id)}
                      >
                        {t('forms.delete')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}

function FormEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  nameTouched,
  onNameTouched,
}: {
  readonly draft: DraftState
  onChange(next: DraftState): void
  onCancel(): void
  onSave(): void
  readonly saving: boolean
  readonly nameTouched: boolean
  onNameTouched(): void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <Card aria-labelledby="form-editor-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="form-editor-heading">
            {draft.id === null ? t('forms.newForm') : t('forms.editForm')}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Field label={t('forms.fieldLabel')}>
          {(control) => (
            <Input
              {...control}
              value={draft.label}
              onChange={(event) => {
                const value = event.target.value
                // Only ever a courtesy pre-fill for a brand-new form — an
                // existing form's name is already load-bearing (submission
                // routing, form-key lookups) and must never move under it.
                if (draft.id === null && !nameTouched) {
                  onChange({ ...draft, label: value, name: slugify(value) })
                } else {
                  onChange({ ...draft, label: value })
                }
              }}
            />
          )}
        </Field>
        <Field label={t('forms.fieldName')} description={t('forms.fieldNameHelp')}>
          {(control) => (
            <Input
              {...control}
              value={draft.name}
              onChange={(event) => {
                onNameTouched()
                onChange({ ...draft, name: event.target.value })
              }}
            />
          )}
        </Field>

        <div>
          <Label>{t('forms.fieldsHeading')}</Label>
          <RepeaterField
            id="form-fields-repeater"
            field={{
              name: 'fields',
              kind: 'json',
              required: true,
              localized: false,
              unique: false,
              hasCustomValidation: false,
              options: { list: true, items: FIELD_EDITOR_ITEMS, keyed: true },
            }}
            value={draft.rows}
            onChange={(value) => onChange({ ...draft, rows: value as FieldEditorRow[] })}
          />
        </div>

        <Field label={t('forms.confirmationMessage')}>
          {(control) => (
            <Input
              {...control}
              value={draft.confirmationMessage}
              onChange={(event) => onChange({ ...draft, confirmationMessage: event.target.value })}
            />
          )}
        </Field>
        <Field label={t('forms.redirectTo')} description={t('forms.redirectToHelp')}>
          {(control) => (
            <Input
              {...control}
              value={draft.redirectTo}
              onChange={(event) => onChange({ ...draft, redirectTo: event.target.value })}
            />
          )}
        </Field>
        <Field label={t('forms.notifyEmails')} description={t('forms.notifyEmailsHelp')}>
          {(control) => (
            <Input
              {...control}
              value={draft.notifyEmailsText}
              onChange={(event) => onChange({ ...draft, notifyEmailsText: event.target.value })}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.autoresponderEnabled}
              onChange={(event) =>
                onChange({ ...draft, autoresponderEnabled: event.target.checked })
              }
            />
            {t('forms.autoresponderEnabled')}
          </label>
          <p className="text-xs text-muted-foreground">{t('forms.autoresponderWarning')}</p>
        </div>
        {draft.autoresponderEnabled && (
          <Field label={t('forms.autoresponderBody')}>
            {(control) => (
              <Input
                {...control}
                value={draft.autoresponderBody}
                onChange={(event) => onChange({ ...draft, autoresponderBody: event.target.value })}
              />
            )}
          </Field>
        )}

        <Field label={t('forms.retainDays')} description={t('forms.retainDaysHelp')}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={1}
              value={draft.retainDays}
              onChange={(event) => onChange({ ...draft, retainDays: event.target.value })}
            />
          )}
        </Field>

        <Field label={t('forms.notifyChannels')} description={t('forms.notifyChannelsHelp')}>
          {(control) => (
            <textarea
              {...control}
              className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={draft.notifyChannelsText}
              onChange={(event) => onChange({ ...draft, notifyChannelsText: event.target.value })}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.captchaEnabled}
              onChange={(event) => onChange({ ...draft, captchaEnabled: event.target.checked })}
            />
            {t('forms.captchaEnabled')}
          </label>
          <p className="text-xs text-muted-foreground">{t('forms.captchaWarning')}</p>
        </div>
        {draft.captchaEnabled && (
          <>
            <Field label={t('forms.captchaSiteKey')}>
              {(control) => (
                <Input
                  {...control}
                  value={draft.captchaSiteKey}
                  onChange={(event) => onChange({ ...draft, captchaSiteKey: event.target.value })}
                />
              )}
            </Field>
            <Field label={t('forms.captchaSecretKey')}>
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  value={draft.captchaSecretKey}
                  onChange={(event) => onChange({ ...draft, captchaSecretKey: event.target.value })}
                />
              )}
            </Field>
          </>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => onChange({ ...draft, active: event.target.checked })}
          />
          {t('forms.activeToggle')}
        </label>

        <div className="flex gap-2">
          <Button type="button" onClick={onSave} disabled={saving || draft.label.trim() === ''}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function Label({ children }: { readonly children: JSX.Element | string }): JSX.Element {
  return <p className="mb-1 text-sm font-medium text-foreground">{children}</p>
}
