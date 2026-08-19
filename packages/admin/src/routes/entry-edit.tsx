import { type FormEvent, type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import type { BlockZones, ContentBlock, Entry } from '../api/content-client.js'
import {
  createEntry,
  deleteEntry,
  duplicateEntry,
  getEntry,
  issuePreview,
  publishEntry,
  unpublishEntry,
  updateEntry,
} from '../api/content-client.js'
import { readUser } from '../api/users-client.js'
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
  sameSnapshot,
} from '../collections/autosave.js'
import { EntryForm } from '../collections/entry-form.js'
import { TranslationSwitcher } from '../collections/translation-switcher.js'
import { useAutosave } from '../collections/use-autosave.js'
import { validateEntry } from '../collections/validate-entry.js'
import { previewPermalink } from '../lib/permalink.js'
import { useDirtyGuard } from '../lib/use-dirty-guard.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Card, CardBody, Input, Label, Modal, Notice, Select } from '../ui/index.js'
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

/** The first string value on the entry — the same heuristic `collection-list.tsx`'s `titleOf` uses, for the same reason: a title field is not a thing contract A names. */
function titleOf(values: Readonly<Record<string, unknown>>, fallback: string): string {
  const candidate = Object.values(values).find((value) => typeof value === 'string' && value !== '')
  return typeof candidate === 'string' ? candidate : fallback
}

/** Every `:param` a collection's route pattern names, resolved from the entry's own id and its current field values — what `previewPermalink` needs to build a preview URL. */
function routeParams(
  pattern: string | undefined,
  id: string | undefined,
  values: Readonly<Record<string, unknown>>,
): Record<string, string> {
  if (pattern === undefined) return {}
  const params: Record<string, string> = {}
  for (const segment of pattern.split('/')) {
    if (!segment.startsWith(':')) continue
    const name = segment.slice(1)
    const value = name === 'id' ? id : values[name]
    if (typeof value === 'string' && value.length > 0) params[name] = value
  }
  return params
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
  /** The `updatedAt` this screen loaded — what a save sends back as `expectedUpdatedAt` (task 7). */
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null)
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
  /** A message per invalid field name (task 3), from client checks or a server refusal that named one. */
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** `createdBy`/`updatedBy` resolved to an email (task 4) — absent means "not resolved yet or not resolvable", in which case the raw id is shown. */
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  /**
   * Who created/last touched this entry — the entry envelope's own
   * `createdBy`/`updatedBy` (`Entry`, not `Entry['values']`: these are
   * system fields the store maintains, never something a form field writes).
   */
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [trashing, setTrashing] = useState(false)
  const [trashError, setTrashError] = useState<string | null>(null)
  /**
   * A `CONTENT_STALE_WRITE` refusal (task 7) — the fresh entry the server
   * actually holds, fetched so the editor can see what changed rather than
   * being told "someone else edited this" with nothing to act on.
   */
  const [staleWrite, setStaleWrite] = useState<Entry | null>(null)

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
          setLoadedUpdatedAt(entry.updatedAt)
          setCreatedBy(entry.createdBy)
          setUpdatedBy(entry.updatedBy)
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

  /**
   * Resolves `createdBy`/`updatedBy` to an email (task 4).
   *
   * `GET /api/users/{id}` is `self-or-admin` (`users-router.ts`), so an editor
   * looking at someone else's entry gets a 403 resolving that author — caught
   * and left unresolved rather than shown as an error: the fallback is simply
   * the raw id, which is still information, and a permission boundary this
   * screen must not fight.
   */
  useEffect(() => {
    if (token === null) return
    const wanted = [createdBy, updatedBy].filter(
      (candidate): candidate is string =>
        candidate !== null && authorNames[candidate] === undefined,
    )
    for (const candidateId of [...new Set(wanted)]) {
      readUser(token, candidateId)
        .then((user) => {
          setAuthorNames((current) => ({ ...current, [candidateId]: user.email }))
        })
        .catch(() => {
          // Unreachable (no permission, deleted account…): fall back to the
          // id, recorded so this is not retried on every render.
          setAuthorNames((current) => ({ ...current, [candidateId]: candidateId }))
        })
    }
  }, [token, createdBy, updatedBy, authorNames])

  function setFieldValue(field: string, value: unknown): void {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field] !== undefined) {
      setErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
    }
  }

  function setBlockZone(zone: string, value: unknown): void {
    setBlocks((current) => ({ ...current, [zone]: value as BlockZones[string] }))
  }

  /** The explicit save is the only thing that writes a version — so it is the only thing that drops the local copy. */
  function forgetAutosave(): void {
    const storage = browserAutosaveStorage()
    if (storage !== null) clearAutosave(storage, autosaveKey(name, id ?? null, locale))
  }

  /** The first invalid field, in schema declaration order — where focus goes after a refused save (task 3). */
  function focusFirstError(fieldErrors: Readonly<Record<string, string>>): void {
    const first = collection?.fields.find((field) => fieldErrors[field.name] !== undefined)
    if (first === undefined) return
    const node = document.getElementById(`field-${first.name}`)
    node?.focus()
  }

  /**
   * The one save path — the form's own submit, `⌘/Ctrl+S`, and "Enregistrer"
   * on the leave-without-saving modal all call this, never a second copy of
   * it (the pitfall L16 already names for the builder: one `<form>`, one
   * submit).
   *
   * Structural checks (length, the slug pattern) run on every save; `required`
   * does not — `packages/schema/src/store/store.ts`'s `update()`/`create()`
   * only enforce it at publication (`packages/api/src/graphql/schema.ts`'s own
   * comment: "`required` is checked at publication, not while drafting"), and
   * blocking an incomplete draft here would be *stricter* than the server,
   * not just earlier. `changeStatus('published')` below runs the `required`
   * check itself, at the point it actually matters.
   */
  async function save(): Promise<boolean> {
    if (token === null || collection === undefined) return false

    const structural = validateEntry(collection, values, t, { enforceRequired: false })
    if (Object.keys(structural).length > 0) {
      setErrors(structural)
      focusFirstError(structural)
      return false
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    setStaleWrite(null)
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
        return true
      }
      if (id !== undefined) {
        const entry = await updateEntry(token, name, id, values, {
          blocks,
          ...(loadedUpdatedAt === null ? {} : { expectedUpdatedAt: loadedUpdatedAt }),
        })
        setValues({ ...entry.values })
        setBlocks({ ...entry.blocks })
        setBaseline({ values: entry.values, blocks: entry.blocks })
        setLoadedUpdatedAt(entry.updatedAt)
        setUpdatedBy(entry.updatedBy)
        setErrors({})
        setRecovered(null)
        forgetAutosave()
        setSaved(true)
        return true
      }
      return false
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'CONTENT_STALE_WRITE' && id !== undefined) {
        // The Notice rendered below (title + body + field-by-field diff)
        // carries the message; no separate generic banner needed too.
        // Fetched so the notice can show what actually changed, rather than
        // just naming the fact that it did (task 7's own acceptance bar:
        // "jamais un écrasement muet").
        getEntry(token, name, id)
          .then((fresh) => setStaleWrite(fresh))
          .catch(() => {
            // The comparison is a courtesy; the refusal itself already stood.
          })
        return false
      }
      if (caught instanceof ApiError && caught.field !== undefined) {
        const fieldErrors = { ...errors, [caught.field]: caught.message }
        setErrors(fieldErrors)
        focusFirstError(fieldErrors)
        return false
      }
      setError(caught instanceof ApiError ? caught.message : t('entryEdit.saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    await save()
  }

  /** Adopts what the server now holds, discarding the local draft (task 7's "reload" side of the stale-write conflict). */
  function adoptServerVersion(): void {
    if (staleWrite === null) return
    setValues({ ...staleWrite.values })
    setBlocks({ ...staleWrite.blocks })
    setBaseline({ values: staleWrite.values, blocks: staleWrite.blocks })
    setLoadedUpdatedAt(staleWrite.updatedAt)
    setStatus(staleWrite.status)
    setPublishedAt(staleWrite.publishedAt)
    setUpdatedBy(staleWrite.updatedBy)
    setStaleWrite(null)
    setError(null)
    forgetAutosave()
  }

  /** Keeps the local draft, now knowingly overwriting the other write, and retries against the server's current `updatedAt`. */
  async function keepMineAndRetry(): Promise<void> {
    if (staleWrite === null) return
    setLoadedUpdatedAt(staleWrite.updatedAt)
    setStaleWrite(null)
    await save()
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
   *
   * `required` is enforced here, and only here (see `save()`'s own comment):
   * this is the one action `packages/schema`'s store actually applies it to.
   */
  async function changeStatus(next: ManagedStatus): Promise<void> {
    if (token === null || id === undefined || next === status) return

    if (next === 'published' && collection !== undefined) {
      const required = validateEntry(collection, values, t, { enforceRequired: true })
      if (Object.keys(required).length > 0) {
        setErrors(required)
        focusFirstError(required)
        setStatusError(t('entryEdit.publishValidationError'))
        return
      }
    }

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
      setLoadedUpdatedAt(entry.updatedAt)
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
      setLoadedUpdatedAt(entry.updatedAt)
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

  /**
   * Moves the entry to the trash and returns to the list (task 4).
   *
   * The list is handed a `trashed` flash via navigation state — an "annuler"
   * button there calls `untrash` immediately, which is what makes trashing
   * from a single confirm safe: the mistake is one click away from undone.
   */
  async function moveToTrash(): Promise<void> {
    if (token === null || id === undefined) return
    setTrashing(true)
    setTrashError(null)
    try {
      await deleteEntry(token, name, id)
      navigate(`/collections/${encodeURIComponent(name)}`, {
        state: { trashed: { collection: name, id, title: titleOf(values, id) } },
      })
    } catch (caught) {
      setTrashError(caught instanceof ApiError ? caught.message : t('entryEdit.trashError'))
      setTrashing(false)
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
  const canTrash = collection !== undefined && canPerform('delete', collection, roles)
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

  /** "Sale" — the dirty-navigation guard's own definition (task 2), reusing the comparison the autosave timer already makes. */
  const dirty = canWrite && !sameSnapshot({ values, blocks }, baseline)
  const blocker = useDirtyGuard(dirty)

  // Declared before the early returns below, because a hook cannot be
  // conditional. `enabled` is what actually turns it off while the entry is
  // still loading or the viewer may not write.
  const autosave = useAutosave({
    enabled: canWrite && !loading,
    storageKey: autosaveKey(name, id ?? null, locale),
    snapshot: { values, blocks },
    baseline,
  })

  // `⌘/Ctrl+S` saves; `⌘/Ctrl+Shift+P` previews (task 5) — both `preventDefault`
  // the browser's own shortcut (the save-page dialog, nothing on `P`) before
  // doing anything else, so the keystroke never leaks through to the page.
  //
  // Read through refs, mounted once, exactly like `useAutosave`'s own
  // `latest`/`baseline` refs (`use-autosave.ts`'s header explains why: listing
  // `values`/`blocks` as dependencies would tear the listener down and rebuild
  // it on every keystroke, and worse, a closure captured before an async
  // `auth` resolution finished would keep calling a `save` that still thinks
  // there is no token).
  const shortcutState = useRef({ canWrite, saving, previewing, isNew, save, preview })
  shortcutState.current = { canWrite, saving, previewing, isNew, save, preview }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const current = shortcutState.current
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (current.canWrite && !current.saving) void current.save()
        return
      }
      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        if (current.isNew) return
        event.preventDefault()
        if (!current.previewing) void current.preview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

  // Permalink preview (task 4). `buildPath`'s own logic, mirrored in
  // `lib/permalink.ts` because that function lives in a Node package this
  // browser bundle cannot import — see that file's header. `null` while a
  // needed `:param` (most often the slug) is still empty.
  const permalink =
    collection.routing !== undefined
      ? previewPermalink(
          collection,
          routeParams(collection.routing.pattern, id, values),
          collection.routing.locale === true ? locale : undefined,
        )
      : null

  return (
    <section aria-labelledby="entry-heading" className="flex flex-col gap-6">
      <h1 id="entry-heading" className="m-0 text-xl leading-7 font-semibold">
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

      {staleWrite !== null && (
        <Notice tone="danger" live="assertive" title={t('entryEdit.staleWriteTitle')}>
          <p>{t('entryEdit.staleWriteBody')}</p>
          <ul>
            {collection.fields
              .filter(
                (field) =>
                  field.kind !== 'blocks' &&
                  JSON.stringify(values[field.name]) !==
                    JSON.stringify(staleWrite.values[field.name]),
              )
              .map((field) => (
                <li key={field.name}>
                  {t('entryEdit.staleWriteFieldDiffers', {
                    field: field.admin?.label ?? field.name,
                  })}
                </li>
              ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={adoptServerVersion}>
              {t('entryEdit.staleWriteReload')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void keepMineAndRetry()}>
              {t('entryEdit.staleWriteKeepMine')}
            </Button>
          </div>
        </Notice>
      )}

      <form onSubmit={(event) => void submit(event)}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {/* Sidebar first in the DOM: on a narrow screen (below 1024px, the
              lot's own threshold) it therefore sits above the form instead of
              in a hidden drawer — "un statut invisible est un statut qu'on
              oublie de changer". `lg:order-2` moves it to the right column on
              a wide screen without touching the DOM order that decides the
              small-screen layout. */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:order-2">
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
              </Card>
            )}

            {/* Permalink (task 4): a preview, not the source of truth — see
                `lib/permalink.ts`'s header. The real preview link a few lines
                down always wins. */}
            {collection.routing !== undefined && (
              <Card>
                <CardBody className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {t('entryEdit.permalinkLabel')}
                  </span>
                  {permalink !== null ? (
                    <code className="break-all text-xs text-muted-foreground">{permalink}</code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('entryEdit.permalinkPending')}
                    </span>
                  )}
                </CardBody>
              </Card>
            )}

            {/* Author (task 4): display only — assigning it is fiche 37's job. */}
            {!isNew && (createdBy !== null || updatedBy !== null) && (
              <Card>
                <CardBody className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {createdBy !== null && (
                    <span>
                      {t('entryEdit.authorCreatedBy', {
                        author: authorNames[createdBy] ?? createdBy,
                      })}
                    </span>
                  )}
                  {updatedBy !== null && (
                    <span>
                      {t('entryEdit.authorUpdatedBy', {
                        author: authorNames[updatedBy] ?? updatedBy,
                      })}
                    </span>
                  )}
                </CardBody>
              </Card>
            )}

            <Card>
              <CardBody className="flex flex-wrap items-center gap-2">
                {!isNew && id !== undefined && (
                  <button type="button" disabled={previewing} onClick={() => void preview()}>
                    {previewing ? t('entryEdit.previewGenerating') : t('entryEdit.previewButton')}
                  </button>
                )}
                {canDuplicate && !isNew && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={duplicating}
                    onClick={() => void duplicate()}
                  >
                    {duplicating ? t('entryEdit.duplicating') : t('entryEdit.duplicateButton')}
                  </Button>
                )}
                {canTrash && !isNew && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={trashing}
                    onClick={() => void moveToTrash()}
                  >
                    {trashing ? t('entryEdit.trashing') : t('entryEdit.trashButton')}
                  </Button>
                )}
                {previewError !== null && <span role="alert">{previewError}</span>}
                {duplicateError !== null && <span role="alert">{duplicateError}</span>}
                {trashError !== null && <span role="alert">{trashError}</span>}

                {/* Keyboard shortcuts help (task 5) — a native `<details>`:
                    reachable and operable by keyboard with no script of its
                    own. */}
                <details className="entry-form__shortcuts">
                  <summary>{t('entryEdit.shortcutsButton')}</summary>
                  <dl>
                    <dt>{t('entryEdit.shortcutSaveKeys')}</dt>
                    <dd>{t('entryEdit.shortcutSaveLabel')}</dd>
                    <dt>{t('entryEdit.shortcutPreviewKeys')}</dt>
                    <dd>{t('entryEdit.shortcutPreviewLabel')}</dd>
                  </dl>
                </details>
              </CardBody>
            </Card>
          </aside>

          <div className="flex min-w-0 flex-col gap-4 lg:order-1">
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

            <EntryForm
              collection={collection}
              values={values}
              blocks={blocks}
              onChange={setFieldValue}
              onBlocksChange={setBlockZone}
              disabled={!canWrite}
              errors={errors}
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
              <div className="sticky bottom-0 -mx-1 border-t border-border bg-background px-1 py-3">
                <button type="submit" disabled={saving}>
                  {isNew ? t('entryEdit.createButton') : t('entryEdit.saveButton')}
                </button>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Below the fold, collapsed by default (task 1): none of this is
          needed to see or edit the entry's own content. */}
      {canWrite && token !== null && assistFields.length > 0 && (
        <details className="entry-form__group">
          <summary>{t('entryEdit.assistantSectionLabel')}</summary>
          {/* L18 task 3. Renders nothing at all on a site with no AI provider —
              the assistant exists to help with an edit, never to gate it. */}
          <AssistantPanel
            token={token}
            fields={assistFields}
            locale={locale}
            siteLocales={siteLocales}
            onApply={setFieldValue}
          />
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
          {entryText !== '' && <ModerationCheck token={token} text={entryText} />}
          {entryText !== '' && (
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
        </details>
      )}

      {!isNew && id !== undefined && token !== null && (
        <details className="entry-form__group">
          <summary>{t('entryEdit.translationsSectionLabel')}</summary>
          <TranslationSwitcher
            token={token}
            collection={name}
            entryId={id}
            currentLocale={locale}
            locales={siteLocales}
            currentValues={values}
          />
        </details>
      )}

      {!isNew && id !== undefined && token !== null && (
        <details className="entry-form__group">
          <summary>{t('entryEdit.historySectionLabel')}</summary>
          <VersionHistory
            token={token}
            collection={name}
            entryId={id}
            canRestore={canWrite}
            onRestored={(entry) => {
              setValues({ ...entry.values })
              setBlocks({ ...entry.blocks })
              setLoadedUpdatedAt(entry.updatedAt)
              setSaved(true)
            }}
          />
        </details>
      )}

      {/* The leave-without-saving guard (task 2): `useBlocker` only fires for
          a navigation that actually changes location, and only while `dirty`
          — see `use-dirty-guard.ts`. A real modal, not `window.confirm()`. */}
      <Modal
        open={blocker.blocked}
        onOpenChange={(open) => {
          if (!open) blocker.reset()
        }}
        title={t('entryEdit.confirmLeaveTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => blocker.reset()}>
              {t('entryEdit.confirmLeaveCancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed()}>
              {t('entryEdit.confirmLeaveDiscard')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                void save().then((ok) => {
                  if (ok) blocker.proceed()
                })
              }}
            >
              {t('entryEdit.confirmLeaveSave')}
            </Button>
          </>
        }
      >
        <p>
          {autosave.savedAt !== null
            ? t('entryEdit.confirmLeaveBodyAutosaved', { at: formatTime(autosave.savedAt) })
            : t('entryEdit.confirmLeaveBody')}
        </p>
      </Modal>
    </section>
  )
}
