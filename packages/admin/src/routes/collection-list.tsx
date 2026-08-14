import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  deleteEntry,
  type Entry,
  listEntries,
  type SortDirection,
  type SortField,
} from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import '../styles/collection-list.css'

const STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

/**
 * L2 task 6: filters, sort, pagination and a bulk action, for one collection
 * at a time. Row-level and bulk-delete visibility both go through
 * `canPerform` — the same rule the server enforces, so nothing shown here
 * can be clicked into a 403.
 */
export function CollectionListRoute(): JSX.Element {
  const { name = '' } = useParams<{ name: string }>()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collection: CollectionSummary | undefined =
    schema.status === 'ready' ? schema.schema.collections.find((c) => c.name === name) : undefined

  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc',
  })
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<readonly Entry[]>([])
  const [cursorStack, setCursorStack] = useState<readonly (string | undefined)[]>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cursor = cursorStack[cursorStack.length - 1]

  const load = useCallback(async () => {
    if (token === null || collection === undefined) return
    setLoading(true)
    setError(null)
    try {
      const page = await listEntries(token, collection.name, {
        sort,
        ...(status === '' ? {} : { status }),
        ...(cursor === undefined ? {} : { after: cursor }),
      })
      setItems(page.items)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Impossible de charger les contenus.')
    } finally {
      setLoading(false)
    }
  }, [token, collection, sort, status, cursor])

  useEffect(() => {
    void load()
  }, [load])

  function toggleSort(field: SortField): void {
    setCursorStack([undefined])
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    )
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected(): Promise<void> {
    if (token === null || collection === undefined) return
    await Promise.all([...selected].map((id) => deleteEntry(token, collection.name, id)))
    await load()
  }

  const canDelete = useMemo(
    () => collection !== undefined && canPerform('delete', collection, roles),
    [collection, roles],
  )
  const canCreate = useMemo(
    () => collection !== undefined && canPerform('create', collection, roles),
    [collection, roles],
  )

  if (schema.status === 'loading') return <p>Chargement…</p>
  if (schema.status === 'error') {
    return <p role="alert">Impossible de charger le schéma : {schema.message}</p>
  }
  if (collection === undefined || !canPerform('read', collection, roles)) {
    return (
      <section aria-labelledby="collection-heading">
        <h1 id="collection-heading">Contenu introuvable</h1>
        <p>
          Cette collection n'existe pas ou vous n'y avez pas accès.{' '}
          <Link to="/collections">Retour</Link>
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="collection-heading">
      <h1 id="collection-heading">{collection.labels.plural}</h1>

      {canCreate && <Link to={`/collections/${encodeURIComponent(name)}/new`}>Nouveau</Link>}

      <div className="collection-list__toolbar">
        <label htmlFor="status-filter">Statut</label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => {
            setCursorStack([undefined])
            setStatus(event.target.value)
          }}
        >
          <option value="">Tous</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        {canDelete && selected.size > 0 && (
          <button type="button" onClick={() => void deleteSelected()}>
            Supprimer ({selected.size})
          </button>
        )}
      </div>

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>Chargement…</p>}

      {!loading && error === null && (
        <>
          <table>
            <thead>
              <tr>
                {canDelete && <th scope="col" aria-label="Sélection" />}
                <th scope="col">Titre</th>
                <SortableHeader field="id" label="ID" sort={sort} onSort={toggleSort} />
                <th scope="col">Statut</th>
                <SortableHeader field="updatedAt" label="Modifié" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id}>
                  {canDelete && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${titleOf(entry)}`}
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`}
                    >
                      {titleOf(entry)}
                    </Link>
                  </td>
                  <td>{entry.id}</td>
                  <td>{entry.status}</td>
                  <td>{entry.updatedAt}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 5 : 4}>Aucun contenu.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="collection-list__pagination">
            <button
              type="button"
              disabled={cursorStack.length <= 1}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={!hasMore || nextCursor === null}
              onClick={() => setCursorStack((s) => [...s, nextCursor ?? undefined])}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function SortableHeader({
  field,
  label,
  sort,
  onSort,
}: {
  readonly field: SortField
  readonly label: string
  readonly sort: { readonly field: SortField; readonly direction: SortDirection }
  onSort(field: SortField): void
}): JSX.Element {
  const active = sort.field === field
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => onSort(field)}>
        {label}
        {active && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
      </button>
    </th>
  )
}
