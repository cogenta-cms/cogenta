import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import type { BlockZones } from '../api/content-client.js'
import { createEntry, getEntry, issuePreview, updateEntry } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { EntryForm } from '../collections/entry-form.js'
import { TranslationSwitcher } from '../collections/translation-switcher.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { VersionHistory } from '../versions/version-history.js'
import '../styles/entry-form.css'

/** What `TranslationSwitcher`'s "create the translation" button hands the new-entry route. */
interface NewTranslationState {
  readonly locale?: string
  readonly translationOf?: string
  readonly values?: Readonly<Record<string, unknown>>
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

  useEffect(() => {
    if (isNew) {
      if (newTranslation?.values !== undefined) setValues({ ...newTranslation.values })
      if (newTranslation?.locale !== undefined) setLocale(newTranslation.locale)
      if (newTranslation?.translationOf !== undefined) {
        setTranslationOf(newTranslation.translationOf)
      }
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
        navigate(`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`, {
          replace: true,
        })
      } else if (id !== undefined) {
        const entry = await updateEntry(token, name, id, values, blocks)
        setValues({ ...entry.values })
        setBlocks({ ...entry.blocks })
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

  if (schema.status === 'loading' || loading) return <p>{t('common.loading')}</p>
  if (schema.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schema.message })}</p>
  }

  const requiredAction = isNew ? 'create' : 'update'
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

  const canWrite = canPerform(requiredAction, collection, roles)

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

      <form onSubmit={(event) => void submit(event)}>
        <EntryForm
          collection={collection}
          values={values}
          blocks={blocks}
          onChange={setFieldValue}
          onBlocksChange={setBlockZone}
          disabled={!canWrite}
        />

        {error !== null && (
          <p role="alert" className="entry-form__error">
            {error}
          </p>
        )}
        {saved && <p role="status">{t('entryEdit.saved')}</p>}

        {canWrite && (
          <button type="submit" disabled={saving}>
            {isNew ? t('entryEdit.createButton') : t('entryEdit.saveButton')}
          </button>
        )}
      </form>

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
