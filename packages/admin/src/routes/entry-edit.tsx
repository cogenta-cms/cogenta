import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import type { BlockZones } from '../api/content-client.js'
import { createEntry, getEntry, updateEntry } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { EntryForm } from '../collections/entry-form.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { VersionHistory } from '../versions/version-history.js'
import '../styles/entry-form.css'

/**
 * One route for both "new" (`/collections/:name/new`) and "edit"
 * (`/collections/:name/:id`) — the form itself does not care which, only
 * whether there was an entry to load first.
 */
export function EntryEditRoute(): JSX.Element {
  const { name = '', id } = useParams<{ name: string; id?: string }>()
  const isNew = id === undefined
  const auth = useAuth()
  const schema = useSchema()
  const navigate = useNavigate()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const collection =
    schema.status === 'ready' ? schema.schema.collections.find((c) => c.name === name) : undefined

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [blocks, setBlocks] = useState<BlockZones>({})
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isNew || token === null || id === undefined) {
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
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : 'Impossible de charger ce contenu.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isNew, token, name, id])

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
        const entry = await createEntry(token, name, values, blocks)
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
      setError(caught instanceof ApiError ? caught.message : "Impossible d'enregistrer ce contenu.")
    } finally {
      setSaving(false)
    }
  }

  if (schema.status === 'loading' || loading) return <p>Chargement…</p>
  if (schema.status === 'error') {
    return <p role="alert">Impossible de charger le schéma : {schema.message}</p>
  }

  const requiredAction = isNew ? 'create' : 'update'
  if (collection === undefined || !canPerform('read', collection, roles)) {
    return (
      <section aria-labelledby="entry-heading">
        <h1 id="entry-heading">Contenu introuvable</h1>
        <p>
          Cette collection n'existe pas ou vous n'y avez pas accès.{' '}
          <Link to="/collections">Retour</Link>
        </p>
      </section>
    )
  }

  const canWrite = canPerform(requiredAction, collection, roles)

  return (
    <section aria-labelledby="entry-heading">
      <h1 id="entry-heading">
        {isNew
          ? `Nouveau : ${collection.labels.singular}`
          : `Modifier : ${collection.labels.singular}`}
      </h1>
      <p>
        <Link to={`/collections/${encodeURIComponent(name)}`}>Retour à la liste</Link>
      </p>

      {!canWrite && (
        <p role="alert">Lecture seule : vous n'avez pas la permission de modifier ce contenu.</p>
      )}

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
        {saved && <p role="status">Enregistré.</p>}

        {canWrite && (
          <button type="submit" disabled={saving}>
            {isNew ? 'Créer' : 'Enregistrer'}
          </button>
        )}
      </form>

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
