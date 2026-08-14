import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type BlockChange,
  type ChangeKind,
  type ContentDiff,
  type Entry,
  type FieldChange,
  getDiff,
  getHistory,
  restoreVersion,
  type VersionSummary,
} from '../api/content-client.js'
import '../styles/version-history.css'

/**
 * L2 task 10: the version list, a field-by-field/block-by-block diff against
 * the live version, and restore. Diffing a serialisation would show "a wall
 * of braces" for a one-word edit — `GET .../diff` already returns a
 * structural diff (`packages/schema/src/store/diff.ts`), so this panel only
 * renders it.
 */
export function VersionHistory({
  token,
  collection,
  entryId,
  canRestore,
  onRestored,
}: {
  readonly token: string
  readonly collection: string
  readonly entryId: string
  readonly canRestore: boolean
  onRestored(entry: Entry): void
}): JSX.Element {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<readonly VersionSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [comparing, setComparing] = useState<number | null>(null)
  const [diff, setDiff] = useState<ContentDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  const [restoring, setRestoring] = useState<number | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setVersions(await getHistory(token, collection, entryId))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('versions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, collection, entryId, t])

  useEffect(() => {
    void load()
  }, [load])

  const liveVersion = versions?.find((v) => v.live)?.version ?? null

  async function compare(version: number): Promise<void> {
    if (comparing === version) {
      setComparing(null)
      setDiff(null)
      return
    }
    if (liveVersion === null) return
    setComparing(version)
    setDiff(null)
    setDiffError(null)
    setDiffLoading(true)
    try {
      setDiff(await getDiff(token, collection, entryId, version, liveVersion))
    } catch (caught) {
      setDiffError(caught instanceof ApiError ? caught.message : t('versions.diffError'))
    } finally {
      setDiffLoading(false)
    }
  }

  async function restore(version: number): Promise<void> {
    setRestoring(version)
    setRestoreError(null)
    try {
      const entry = await restoreVersion(token, collection, entryId, version)
      onRestored(entry)
      await load()
      setComparing(null)
      setDiff(null)
    } catch (caught) {
      setRestoreError(caught instanceof ApiError ? caught.message : t('versions.restoreError'))
    } finally {
      setRestoring(null)
    }
  }

  return (
    <section aria-labelledby="version-history-heading" className="version-history">
      <h2 id="version-history-heading">{t('versions.heading')}</h2>

      {loading && <p>{t('common.loading')}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {restoreError !== null && <p role="alert">{restoreError}</p>}

      {!loading && error === null && versions !== null && (
        <ol className="version-history__list">
          {versions.map((entry) => (
            <li key={entry.version} className="version-history__item">
              <span>
                v{entry.version} — {entry.status}
                {entry.live && t('versions.current')}
              </span>
              <span>{entry.createdAt}</span>

              {!entry.live && (
                <div className="version-history__actions">
                  <button type="button" onClick={() => void compare(entry.version)}>
                    {comparing === entry.version ? t('versions.hideDiff') : t('versions.compare')}
                  </button>
                  {canRestore && (
                    <button
                      type="button"
                      disabled={restoring !== null}
                      onClick={() => void restore(entry.version)}
                    >
                      {restoring === entry.version
                        ? t('versions.restoring')
                        : t('versions.restore')}
                    </button>
                  )}
                </div>
              )}

              {comparing === entry.version && (
                <div className="version-history__diff">
                  {diffLoading && <p>{t('versions.computingDiff')}</p>}
                  {diffError !== null && <p role="alert">{diffError}</p>}
                  {diff !== null && <DiffView diff={diff} />}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function DiffView({ diff }: { readonly diff: ContentDiff }): JSX.Element {
  const { t } = useTranslation()
  if (!diff.changed) return <p>{t('versions.noDiff')}</p>

  return (
    <>
      {diff.fields.length > 0 && (
        <ul className="version-history__field-changes">
          {diff.fields.map((change) => (
            <FieldChangeRow key={change.field} change={change} />
          ))}
        </ul>
      )}

      {diff.blocks.length > 0 && (
        <ul className="version-history__block-changes">
          {diff.blocks.map((change) => (
            <BlockChangeRow key={`${change.zone}:${change.key}`} change={change} />
          ))}
        </ul>
      )}
    </>
  )
}

function FieldChangeRow({ change }: { readonly change: FieldChange }): JSX.Element {
  const { t } = useTranslation()
  return (
    <li>
      <strong>{change.field}</strong> — {labelFor(change.change, t)}
      {change.change !== 'added' && t('versions.before', { value: stringify(change.before) })}
      {change.change !== 'removed' && t('versions.after', { value: stringify(change.after) })}
    </li>
  )
}

function BlockChangeRow({ change }: { readonly change: BlockChange }): JSX.Element {
  const { t } = useTranslation()
  return (
    <li>
      <strong>
        {change.zone} / {change.type}
      </strong>{' '}
      — {labelFor(change.change, t)}
      {change.change === 'moved' &&
        t('versions.movedPosition', { from: change.fromIndex, to: change.toIndex })}
      {change.fields.length > 0 && (
        <ul>
          {change.fields.map((fieldChange) => (
            <FieldChangeRow key={fieldChange.field} change={fieldChange} />
          ))}
        </ul>
      )}
    </li>
  )
}

function labelFor(change: ChangeKind | 'moved', t: (key: string) => string): string {
  switch (change) {
    case 'added':
      return t('versions.changeAdded')
    case 'removed':
      return t('versions.changeRemoved')
    case 'changed':
      return t('versions.changeChanged')
    case 'moved':
      return t('versions.changeMoved')
  }
}

function stringify(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
