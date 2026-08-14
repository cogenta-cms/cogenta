import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { type AuditEntry, listAuditEntries, verifyAuditLog } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'

/** L2 task 14: a consultable, filterable view over `@cogenta/auth`'s hash-chained audit log — read-only, `admin` only (the API refuses everyone else with 403). */
export function AuditRoute(): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState('')
  const [collection, setCollection] = useState('')
  const [entries, setEntries] = useState<readonly AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const found = await listAuditEntries(token, {
        ...(actorId === '' ? {} : { actorId }),
        ...(action === '' ? {} : { action }),
        ...(collection === '' ? {} : { collection }),
      })
      setEntries(found)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Impossible de charger le journal d'audit.",
      )
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, actorId, action, collection])

  useEffect(() => {
    void load()
  }, [load])

  function submitFilters(event: FormEvent): void {
    event.preventDefault()
    void load()
  }

  async function verify(): Promise<void> {
    if (token === null) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await verifyAuditLog(token)
      setVerifyResult(result.ok ? 'Chaîne intacte.' : 'Anomalie détectée.')
    } catch (caught) {
      setVerifyResult(
        caught instanceof ApiError
          ? caught.message
          : "Impossible de vérifier l'intégrité du journal.",
      )
    } finally {
      setVerifying(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="audit-heading">
        <h1 id="audit-heading">Journal d'audit</h1>
        <p role="alert">
          Réservé au rôle « admin » : ce journal nomme les actions de tous les comptes.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="audit-heading">
      <h1 id="audit-heading">Journal d'audit</h1>

      <form onSubmit={submitFilters}>
        <div className="field">
          <label htmlFor="audit-actor">Acteur</label>
          <input
            id="audit-actor"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-action">Action</label>
          <input
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-collection">Collection</label>
          <input
            id="audit-collection"
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
          />
        </div>
        <button type="submit">Filtrer</button>
      </form>

      <p>
        <button type="button" disabled={verifying} onClick={() => void verify()}>
          {verifying ? 'Vérification…' : "Vérifier l'intégrité"}
        </button>
        {verifyResult !== null && <span role="status"> {verifyResult}</span>}
      </p>

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>Chargement…</p>}

      {!loading && error === null && (
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Acteur</th>
              <th scope="col">Rôles</th>
              <th scope="col">Action</th>
              <th scope="col">Collection</th>
              <th scope="col">Entrée</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.at}</td>
                <td>{entry.actorId ?? '—'}</td>
                <td>{entry.actorRoles.join(', ')}</td>
                <td>{entry.action}</td>
                <td>{entry.collection ?? '—'}</td>
                <td>{entry.entryId ?? '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6}>Aucune entrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}
