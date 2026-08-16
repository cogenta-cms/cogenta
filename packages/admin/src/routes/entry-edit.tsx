import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import type { BlockZones, ContentBlock } from '../api/content-client.js'
import { createEntry, getEntry, issuePreview, updateEntry } from '../api/content-client.js'
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
import { Button } from '../ui/index.js'
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
  const assistFields: readonly AssistField[] = Object.entries(collection.fields)
    .filter(([, field]) => field.kind === 'text')
    .map(([fieldName, field]) => ({
      name: fieldName,
      label: field.admin?.label ?? fieldName,
      value: typeof values[fieldName] === 'string' ? (values[fieldName] as string) : '',
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
