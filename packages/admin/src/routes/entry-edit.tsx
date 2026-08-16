import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import type { BlockZones, ContentBlock } from '../api/content-client.js'
import {
  createEntry,
  duplicateEntry,
  getEntry,
  issuePreview,
  publishEntry,
  unpublishEntry,
  updateEntry,
} from '../api/content-client.js'
import { AssistantPanel, type AssistField } from '../assist/assistant-panel.js'
import { ClassifyPanel } from '../assist/classify-panel.js'
import { FaqSchemaPanel } from '../assist/faq-schema-panel.js'
import { ModerationCheck } from '../assist/moderation-check.js'
import { useAuth } from '../auth/auth-context.js'
import { PageBuilder } from '../builder/page-builder.js'
import type { AutosaveRecord, AutosaveSnapshot } from '../collections/autosave.js'
import {
  autosaveKey,
  browserAutosaveStorage,
  clearAutosave,
  isRecoverable,
  readAutosave,
} from '../collections/autosave.js'
import { EntryForm } from '../collections/entry-form.js'
import { TranslationSwitcher } from '../collections/translation-switcher.js'
import { useAutosave } from '../collections/use-autosave.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Card, CardBody, Input, Label, Notice, Select } from '../ui/index.js'
import { VersionHistory } from '../versions/version-history.js'
import '../styles/entry-form.css'

/** What `TranslationSwitcher`'s "create the translation" button hands the new-entry route. */
interface NewTranslationState {
  readonly locale?: string
  readonly translationOf?: string
  readonly values?: Readonly<Record<string, unknown>>
}

const EMPTY_SNAPSHOT: AutosaveSnapshot = { values: {}, blocks: {} }

/**
 * Which editor the person last chose (L16).
 *
 * The two are not a migration from one to the other: the form is the only way
 * to reach a media reference, a list of items or a rich-text document, and the
 * builder is the only way to see the page. Whichever someone used last is the
 * one they get next time, per browser, never per entry.
 */
const EDITOR_MODE_STORAGE_KEY = 'cogenta.admin.editorMode'

type EditorMode = 'form' | 'visual'

/**
 * The statuses the status selector moves an entry directly between.
 *
 * `scheduled` is a real member of contract A's `ContentStatus`, and — now that
 * `cogenta serve` actually registers `@cogenta/schema`'s queue-based scheduler
 * (`src/scheduling/publish.ts`) — a real destination, just not one this plain
 * selector offers: moving *to* `scheduled` needs a date, which a `<select>`
 * has nowhere to carry. It gets its own control instead, right below (a real
 * date/time picker, not free text) — see `SCHEDULABLE_STATUSES` and the
 * scheduling card in the render below.
 */
const MANAGED_STATUSES = ['draft', 'published', 'archived'] as const
type ManagedStatus = (typeof MANAGED_STATUSES)[number]

/** Which statuses may be scheduled from — anything short of already public. */
const SCHEDULABLE_STATUSES = ['draft', 'archived', 'scheduled'] as const
type SchedulableStatus = (typeof SCHEDULABLE_STATUSES)[number]

function isManagedStatus(status: string): status is ManagedStatus {
  return (MANAGED_STATUSES as readonly string[]).includes(status)
}

function isSchedulableStatus(status: string): status is SchedulableStatus {
  return (SCHEDULABLE_STATUSES as readonly string[]).includes(status)
}

/** `datetime-local`'s value format, in the browser's own time zone — never UTC, which would silently shift what an editor typed. */
function toDatetimeLocalValue(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

function storedEditorMode(): EditorMode {
  try {
    return localStorage.getItem(EDITOR_MODE_STORAGE_KEY) === 'visual' ? 'visual' : 'form'
  } catch {
    // A browser with storage denied still gets an editor, just not a memory.
    return 'form'
  }
}

/** Just the clock time: the autosave being reported is always minutes old, never days. */
function formatTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString()
}

/**
 * One route for both "new" (`/collections/:name/new`) and "edit"
 * (`/collections/:name/:id`) — the form itself does not care which, only
 * whether there was an entry to load first.
 */
export function EntryEditRoute(): JSX.Element {
  const { t } = useTranslation()
  const { name = '', id } = useParams<{ name: string; id?: string }>()
  const isNew = id === undefined
  const auth = useAuth()
  const schema = useSchema()
  const navigate = useNavigate()
  const location = useLocation()
  const newTranslation = isNew ? (location.state as NewTranslationState | null) : null

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const collection =
    schema.status === 'ready' ? schema.schema.collections.find((c) => c.name === name) : undefined
  const siteLocales = schema.status === 'ready' ? (schema.schema.site?.locales ?? []) : []
  const defaultLocale =
    schema.status === 'ready' ? (schema.schema.site?.defaultLocale ?? 'en') : 'en'

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [blocks, setBlocks] = useState<BlockZones>({})
  const [locale, setLocale] = useState(defaultLocale)
  const [translationOf, setTranslationOf] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  /** What the server last confirmed — the thing autosave compares against. */
  const [baseline, setBaseline] = useState<AutosaveSnapshot>(EMPTY_SNAPSHOT)
  /** A newer local draft found on open, waiting for the editor to accept or drop it. */
  const [recovered, setRecovered] = useState<AutosaveRecord | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(storedEditorMode)
  const [status, setStatus] = useState('draft')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  /** The entry's real `publishedAt`, as last confirmed by the server. */
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  /** The `datetime-local` input's own value — only ever sent on "Programmer". */
  const [scheduleInput, setScheduleInput] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) {
      const prefilled = { ...(newTranslation?.values ?? {}) }
      if (newTranslation?.values !== undefined) setValues(prefilled)
      if (newTranslation?.locale !== undefined) setLocale(newTranslation.locale)
      if (newTranslation?.translationOf !== undefined) {
        setTranslationOf(newTranslation.translationOf)
      }
      setBaseline({ values: prefilled, blocks: {} })
      setLoading(false)
      return
    }
    if (token === null || id === undefined) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getEntry(token, name, id)
      .then((entry) => {
        if (!cancelled) {
          setValues({ ...entry.values })
          setBlocks({ ...entry.blocks })
          setLocale(entry.locale)
          setTranslationOf(entry.translationOf)
          setStatus(entry.status)
          setPublishedAt(entry.publishedAt)
          setScheduleInput(
            entry.publishedAt === null ? '' : toDatetimeLocalValue(entry.publishedAt),
          )

          const loaded: AutosaveSnapshot = { values: entry.values, blocks: entry.blocks }
          setBaseline(loaded)

          // Offered, never applied on its own: silently replacing what the
          // server holds with what a tab happened to have is the one way an
          // autosave can destroy work instead of saving it.
          const storage = browserAutosaveStorage()
          if (storage !== null) {
            const stored = readAutosave(storage, autosaveKey(name, entry.id, entry.locale))
            setRecovered(isRecoverable(stored, loaded, entry.updatedAt) ? stored : null)
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : t('entryEdit.loadError'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isNew, token, name, id, newTranslation, t])

  function setFieldValue(field: string, value: unknown): void {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function setBlockZone(zone: string, value: unknown): void {
    setBlocks((current) => ({ ...current, [zone]: value as BlockZones[string] }))
  }

  /** The explicit save is the only thing that writes a version — so it is the only thing that drops the local copy. */
  function forgetAutosave(): void {
    const storage = browserAutosaveStorage()
    if (storage !== null) clearAutosave(storage, autosaveKey(name, id ?? null, locale))
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      if (isNew) {
        const entry = await createEntry(token, name, values, {
          blocks,
          locale,
          ...(translationOf === null ? {} : { translationOf }),
        })
        forgetAutosave()
        navigate(`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`, {
          replace: true,
        })
      } else if (id !== undefined) {
        const entry = await updateEntry(token, name, id, values, blocks)
        setValues({ ...entry.values })
        setBlocks({ ...entry.blocks })
        setBaseline({ values: entry.values, blocks: entry.blocks })
        setRecovered(null)
        forgetAutosave()
        setSaved(true)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('entryEdit.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function preview(): Promise<void> {
    if (token === null || id === undefined) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const link = await issuePreview(token, name, id)
      if (link.url === null) {
        setPreviewError(t('entryEdit.previewNoSiteUrl'))
        return
      }
      // The real site, not a simulation inside the admin — the preview
      // button's whole reason to exist (L2-admin.md).
      window.open(link.url, '_blank', 'noopener')
    } catch (caught) {
      setPreviewError(caught instanceof ApiError ? caught.message : t('entryEdit.previewError'))
    } finally {
      setPreviewing(false)
    }
  }

  /**
   * Moves the entry to `next`: `POST .../publish` for `published`, and
   * `POST .../unpublish` (carrying the target status) for `draft`/`archived`
   * — the two real routes, never a made-up generic status write.
   */
  async function changeStatus(next: ManagedStatus): Promise<void> {
    if (token === null || id === undefined || next === status) return
    setStatusBusy(true)
    setStatusError(null)
    setStatusMessage(null)
    try {
      const entry =
        next === 'published'
          ? await publishEntry(token, name, id)
          : await unpublishEntry(token, name, id, next)
      setStatus(entry.status)
      setPublishedAt(entry.publishedAt)
      setStatusMessage(
        t('entryEdit.statusChanged', { status: t(`entryEdit.status.${entry.status}`) }),
      )
    } catch (caught) {
      setStatusError(caught instanceof ApiError ? caught.message : t('entryEdit.statusError'))
    } finally {
      setStatusBusy(false)
    }
  }

  /**
   * Schedules — or reschedules — the entry for `scheduleInput`.
   *
   * `update()` never changes `status` (contract A keeps that transition to
   * `publish`/`unpublish`), so this is `POST .../unpublish` with
   * `status: 'scheduled'`, carrying the real date/time the picker below
   * collected — never free text, and never applied on typing alone: a real
   * publication date needs an explicit "Programmer".
   */
  async function schedule(): Promise<void> {
    if (token === null || id === undefined) return
    if (scheduleInput === '') {
      setStatusError(t('entryEdit.scheduleDateRequired'))
      return
    }
    const iso = new Date(scheduleInput).toISOString()
    setStatusBusy(true)
    setStatusError(null)
    setStatusMessage(null)
    try {
      const entry = await unpublishEntry(token, name, id, 'scheduled', iso)
      setStatus(entry.status)
      setPublishedAt(entry.publishedAt)
      setStatusMessage(
        t('entryEdit.statusChanged', { status: t(`entryEdit.status.${entry.status}`) }),
      )
    } catch (caught) {
      setStatusError(caught instanceof ApiError ? caught.message : t('entryEdit.scheduleError'))
    } finally {
      setStatusBusy(false)
    }
  }

  /** Copies the working state into a new draft, then opens it — never the source. */
  async function duplicate(): Promise<void> {
    if (token === null || id === undefined) return
    setDuplicating(true)
    setDuplicateError(null)
    try {
      const copy = await duplicateEntry(token, name, id)
      navigate(`/collections/${encodeURIComponent(name)}/${encodeURIComponent(copy.id)}`)
    } catch (caught) {
      setDuplicateError(caught instanceof ApiError ? caught.message : t('entryEdit.duplicateError'))
    } finally {
      setDuplicating(false)
    }
  }

  function chooseEditorMode(mode: EditorMode): void {
    setEditorMode(mode)
    try {
      localStorage.setItem(EDITOR_MODE_STORAGE_KEY, mode)
    } catch {
      // Storage denied: the choice still applies to this screen.
    }
  }

  const requiredAction = isNew ? 'create' : 'update'
  const canWrite = collection !== undefined && canPerform(requiredAction, collection, roles)
  const canPublish = collection !== undefined && canPerform('publish', collection, roles)
  /** Duplicating produces a new entry, so it is gated the same as creating one. */
  const canDuplicate = collection !== undefined && canPerform('create', collection, roles)
  /**
   * Scheduling needs somewhere to put the date: the store refuses
   * `unpublish(id, { status: 'scheduled' })` on a collection that never
   * declared `publishedAt` (an ordinary, optional field of contract A, not a
   * system column every collection gets for free) — this mirrors that guard
   * so the control simply is not offered rather than failing when pressed.
   */
  const hasScheduling = collection?.fields.some((field) => field.name === 'publishedAt') ?? false

  /** The one block zone the builder composes — the first the collection declares. */
  const blockZone = collection?.fields.find((field) => field.kind === 'blocks')?.name
  /**
   * The builder previews the *real* page, which a never-saved entry does not
   * have: there is no entry to render and no path to render it at. Rather than
   * inventing a preview for a page that does not exist — the one thing this
   * whole lot exists to avoid — the mode says so and the form stays.
   */
  const visualBuilding = editorMode === 'visual' && blockZone !== undefined && isNew
  const builderZone =
    editorMode === 'visual' && blockZone !== undefined && !isNew ? blockZone : null

  // Declared before the early returns below, because a hook cannot be
  // conditional. `enabled` is what actually turns it off while the entry is
  // still loading or the viewer may not write.
  const autosave = useAutosave({
    enabled: canWrite && !loading,
    storageKey: autosaveKey(name, id ?? null, locale),
    snapshot: { values, blocks },
    baseline,
  })

  if (schema.status === 'loading' || loading) return <p>{t('common.loading')}</p>
  if (schema.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schema.message })}</p>
  }

  if (collection === undefined || !canPerform('read', collection, roles)) {
    return (
      <section aria-labelledby="entry-heading">
        <h1 id="entry-heading">{t('collectionList.notFoundHeading')}</h1>
        <p>
          {t('collectionList.notFoundBody')}{' '}
          <Link to="/collections">{t('collectionList.back')}</Link>
        </p>
      </section>
    )
  }

  /**
   * The plain-text fields the assistant can work on.
   *
   * Only `text` — a `richText` value is a portable-text document, not a string,
   * and handing a suggestion back into one means deciding where in the document
   * it goes. That is a real piece of work rather than a cast, and doing it badly
   * would destroy an editor's marks and links, so it is left out on purpose
   * until it can be done properly.
   */
  const assistFields: readonly AssistField[] = collection.fields
    .filter((field) => field.kind === 'text')
    .map((field) => ({
      name: field.name,
      label: field.admin?.label ?? field.name,
      value: typeof values[field.name] === 'string' ? (values[field.name] as string) : '',
    }))

  /**
   * The whole entry's plain text, for the four assistant tools below that
   * work on "the content of this entry" rather than on one chosen field:
   * classification, moderation, FAQ and Schema.org drafting all read this.
   * Computed directly off `collection.fields` (an array) rather than
   * `assistFields` above, so a collection with more than one `text` field
   * still contributes every one of them.
   */
  const entryText = collection.fields
    .filter((field) => field.kind === 'text')
    .map((field) => (typeof values[field.name] === 'string' ? (values[field.name] as string) : ''))
    .filter((value) => value !== '')
    .join('\n\n')

  /**
   * The multi-value `select` field this collection uses for tags/categories,
   * when it has one — the vocabulary `assist.classify` chooses from and the
   * field a suggestion is written into once accepted. A single-value
   * `select` is left out: accepting a suggestion there means *replacing* the
   * current choice rather than adding to it, a different interaction this
   * panel does not offer.
   */
  const classifyField = collection.fields.find(
    (field) => field.kind === 'select' && field.options.many === true,
  )
  const classifyVocabulary = (
    (classifyField?.options.options as readonly { readonly value?: unknown }[] | undefined) ?? []
  )
    .map((choice) => choice.value)
    .filter((value): value is string => typeof value === 'string')
  const classifyCurrentValue = Array.isArray(values[classifyField?.name ?? ''])
    ? (values[classifyField?.name ?? ''] as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : []

  return (
    <section aria-labelledby="entry-heading">
      <h1 id="entry-heading">
        {t(isNew ? 'entryEdit.newHeading' : 'entryEdit.editHeading', {
          label: collection.labels.singular,
        })}
      </h1>
      {siteLocales.length > 1 && (
        <p>
          {t('entryEdit.languageLabel')} <strong>{locale}</strong>
          {isNew && translationOf !== null && t('entryEdit.newTranslationSuffix')}
        </p>
      )}
      <p>
        <Link to={`/collections/${encodeURIComponent(name)}`}>{t('entryEdit.backToList')}</Link>
      </p>

      {/* Status and publication — the control the admin never had, even though
          the API route behind the publish button has existed since L2. Visible
          and near the top on purpose, not a field buried in the form. */}
      {!isNew && id !== undefined && (
        <Card className="entry-form__status">
          <CardBody className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {t('entryEdit.statusLabel')}
              </span>
              {canPublish && isManagedStatus(status) ? (
                <Select
                  aria-label={t('entryEdit.statusLabel')}
                  value={status}
                  disabled={statusBusy}
                  onChange={(event) => void changeStatus(event.target.value as ManagedStatus)}
                >
                  {MANAGED_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {t(`entryEdit.status.${option}`)}
                    </option>
                  ))}
                </Select>
              ) : (
                <strong>{t(`entryEdit.status.${status}`)}</strong>
              )}
            </div>

            {canPublish && status !== 'published' && isManagedStatus(status) && (
              <Button
                type="button"
                variant="primary"
                disabled={statusBusy}
                onClick={() => void changeStatus('published')}
              >
                {t('entryEdit.publishButton')}
              </Button>
            )}

            {canDuplicate && (
              <Button
                type="button"
                variant="secondary"
                disabled={duplicating}
                onClick={() => void duplicate()}
              >
                {duplicating ? t('entryEdit.duplicating') : t('entryEdit.duplicateButton')}
              </Button>
            )}

            {/* Scheduling: `@cogenta/schema`'s queue-based scheduler is now
                registered by `cogenta serve` (every 60s, plus once at
                startup), so this really publishes the entry once its date
                comes — never a no-op control. A real date/time picker, not
                free text; nothing is sent until "Programmer"/"Reprogrammer"
                is pressed. */}
            {canPublish && hasScheduling && isSchedulableStatus(status) && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <Label htmlFor="schedule-at">{t('entryEdit.scheduleLabel')}</Label>
                <Input
                  id="schedule-at"
                  type="datetime-local"
                  value={scheduleInput}
                  disabled={statusBusy}
                  onChange={(event) => setScheduleInput(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={statusBusy}
                  onClick={() => void schedule()}
                >
                  {status === 'scheduled'
                    ? t('entryEdit.rescheduleButton')
                    : t('entryEdit.scheduleButton')}
                </Button>
                {status === 'scheduled' && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={statusBusy}
                    onClick={() => void changeStatus('draft')}
                  >
                    {t('entryEdit.cancelScheduleButton')}
                  </Button>
                )}
              </div>
            )}
          </CardBody>

          {status === 'scheduled' && publishedAt !== null && (
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              {t('entryEdit.scheduledFor', { at: new Date(publishedAt).toLocaleString() })}
            </p>
          )}

          {!isManagedStatus(status) && status !== 'scheduled' && (
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              {t('entryEdit.statusUnmanaged')}
            </p>
          )}
          {statusError !== null && (
            <Notice tone="danger" live="assertive">
              {statusError}
            </Notice>
          )}
          {statusMessage !== null && (
            <Notice tone="success" live="polite">
              {statusMessage}
            </Notice>
          )}
          {duplicateError !== null && (
            <Notice tone="danger" live="assertive">
              {duplicateError}
            </Notice>
          )}
        </Card>
      )}

      {!isNew && id !== undefined && (
        <p>
          <button type="button" disabled={previewing} onClick={() => void preview()}>
            {previewing ? t('entryEdit.previewGenerating') : t('entryEdit.previewButton')}
          </button>
          {previewError !== null && <span role="alert"> {previewError}</span>}
        </p>
      )}

      {!canWrite && <p role="alert">{t('entryEdit.readOnly')}</p>}

      {recovered !== null && (
        <div role="alert" className="entry-form__recovery">
          <p>{t('entryEdit.autosaveFound', { at: formatTime(recovered.at) })}</p>
          <button
            type="button"
            onClick={() => {
              setValues({ ...recovered.values })
              setBlocks({ ...recovered.blocks })
              setRecovered(null)
            }}
          >
            {t('entryEdit.autosaveRestore')}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              forgetAutosave()
              setRecovered(null)
            }}
          >
            {t('entryEdit.autosaveDiscard')}
          </button>
        </div>
      )}

      {blockZone !== undefined && (
        <fieldset aria-label={t('builder.modeLabel')} className="entry-form__modes">
          <Button
            size="sm"
            variant={editorMode === 'form' ? 'primary' : 'ghost'}
            aria-pressed={editorMode === 'form'}
            onClick={() => chooseEditorMode('form')}
          >
            {t('builder.modeForm')}
          </Button>
          <Button
            size="sm"
            variant={editorMode === 'visual' ? 'primary' : 'ghost'}
            aria-pressed={editorMode === 'visual'}
            onClick={() => chooseEditorMode('visual')}
          >
            {t('builder.modeVisual')}
          </Button>
        </fieldset>
      )}

      {visualBuilding && <p role="note">{t('builder.unavailableNew')}</p>}

      <form onSubmit={(event) => void submit(event)}>
        <EntryForm
          collection={collection}
          values={values}
          blocks={blocks}
          onChange={setFieldValue}
          onBlocksChange={setBlockZone}
          disabled={!canWrite}
          {...(builderZone === null ? {} : { skipFields: new Set([builderZone]) })}
        />

        {builderZone !== null && token !== null && id !== undefined && (
          // The builder is inside the form on purpose: its edits are the same
          // `blocks` state the form's own save button writes, so there is one
          // save, one autosave and one version — never a second, quieter way
          // for content to reach the database.
          <PageBuilder
            token={token}
            collection={name}
            entryId={id}
            zone={builderZone}
            blocks={blocks[builderZone] ?? []}
            onBlocksChange={(next) => setBlockZone(builderZone, next)}
            disabled={!canWrite}
          />
        )}

        {error !== null && (
          <p role="alert" className="entry-form__error">
            {error}
          </p>
        )}
        {saved && <p role="status">{t('entryEdit.saved')}</p>}
        {autosave.savedAt !== null && !saved && (
          // Deliberately worded as a local safety net, not as "saved": an
          // editor who reads "saved" and closes the tab must not discover
          // later that nothing reached the server.
          <p className="entry-form__autosave">
            {t('entryEdit.autosaveKept', { at: formatTime(autosave.savedAt) })}
          </p>
        )}

        {canWrite && (
          <button type="submit" disabled={saving}>
            {isNew ? t('entryEdit.createButton') : t('entryEdit.saveButton')}
          </button>
        )}
      </form>

      {/* L18 task 3. Renders nothing at all on a site with no AI provider, and
          nothing at all for a viewer who may not write — the assistant exists to
          help with an edit. Accepting a suggestion fills the form; saving is
          still the editor's own submit, through the usual permission check. */}
      {canWrite && token !== null && assistFields.length > 0 && (
        <AssistantPanel
          token={token}
          fields={assistFields}
          locale={locale}
          siteLocales={siteLocales}
          onApply={setFieldValue}
        />
      )}

      {/* The five assistant tools L18 shipped with no admin surface at all —
          each is its own small panel, each checks its own tool's availability
          and renders nothing when it is not on offer, and none of them ever
          writes to the entry without an explicit click on its own suggestion. */}
      {canWrite && token !== null && entryText !== '' && classifyField !== undefined && (
        <ClassifyPanel
          token={token}
          text={entryText}
          field={{
            name: classifyField.name,
            label: classifyField.admin?.label ?? classifyField.name,
            options: classifyVocabulary,
          }}
          currentValue={classifyCurrentValue}
          onAccept={setFieldValue}
        />
      )}

      {canWrite && token !== null && entryText !== '' && (
        <ModerationCheck token={token} text={entryText} />
      )}

      {canWrite && token !== null && entryText !== '' && (
        <FaqSchemaPanel
          token={token}
          text={entryText}
          {...(typeof values.title === 'string' ? { title: values.title } : {})}
          blockZone={blockZone ?? null}
          onAcceptFaq={(zone, block: ContentBlock) => {
            setBlockZone(zone, [...(blocks[zone] ?? []), block])
          }}
        />
      )}

      {!isNew && id !== undefined && token !== null && (
        <TranslationSwitcher
          token={token}
          collection={name}
          entryId={id}
          currentLocale={locale}
          locales={siteLocales}
          currentValues={values}
        />
      )}

      {!isNew && id !== undefined && token !== null && (
        <VersionHistory
          token={token}
          collection={name}
          entryId={id}
          canRestore={canWrite}
          onRestored={(entry) => {
            setValues({ ...entry.values })
            setBlocks({ ...entry.blocks })
            setSaved(true)
          }}
        />
      )}
    </section>
  )
}
