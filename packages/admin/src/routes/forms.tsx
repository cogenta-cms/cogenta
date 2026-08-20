import { type JSX, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  createForm,
  deleteForm,
  FORM_FIELD_KINDS,
  type FormDefinition,
  type FormFieldDefinition,
  type FormFieldKind,
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
 * Fiche 16 task 2 — the form builder. Reuses `RepeaterField` (fiche 03 task
 * 2) for the list of fields rather than a second repeater component: a
 * form's field list is exactly the same shape a block's `f.list(...)` is —
 * an ordered, add/remove/reorder list of small typed rows — the builder's
 * only job is to describe *what one row looks like*.
 *
 * Conditional fields are explicitly out of scope for this first version
 * (ADR-0026's own renoncement): every row shows every property regardless of
 * `kind`, with help text on the ones that only apply to some kinds.
 */

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
  { name: 'choicesText', kind: 'text', required: false, localized: false, options: {} },
  { name: 'consentText', kind: 'text', required: false, localized: false, options: {} },
]

interface FieldEditorRow {
  readonly name: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required?: boolean
  readonly help?: string
  readonly choicesText?: string
  readonly consentText?: string
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
  }))
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
  }))
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
}

function draftFromForm(form: FormDefinition): DraftState {
  return {
    id: form.id,
    name: form.name,
    label: form.label,
    rows: rowsFromFields(form.fields),
    active: form.active,
    confirmationMessage: form.confirmationMessage,
    redirectTo: form.redirectTo ?? '',
    notifyEmailsText: form.notifyEmails.join(', '),
    autoresponderEnabled: form.autoresponder.enabled,
    autoresponderBody: form.autoresponder.body ?? '',
    retainDays: String(form.retainDays),
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
