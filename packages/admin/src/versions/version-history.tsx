import { type JSX, useCallback, useEffect, useId, useMemo, useState } from 'react'
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
  type WordChange,
} from '../api/content-client.js'
import { listUsers } from '../api/users-client.js'
import { Button, Modal, Notice } from '../ui/index.js'
import '../styles/version-history.css'

/**
 * L2 task 10's version list, extended by fiche 06:
 *
 * - compares any two versions, not only "this one vs live" (task 1);
 * - shows who/when/what for every version, windowed rather than rendering an
 *   unbounded list (task 2);
 * - a changed `text`/`richText` field shows the words that actually moved,
 *   via `FieldChange.words` (`enrichWordDiffs`, task 3);
 * - restoring asks first, and is undoable in one click afterwards (task 5).
 *
 * `GET .../diff` already accepts two arbitrary versions and already computes
 * a structural diff — this panel only renders it, same as before.
 */

const PAGE_SIZE = 20

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
  const { t, i18n } = useTranslation()
  const radioName = useId()

  const [versions, setVersions] = useState<readonly VersionSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // id -> email, best-effort. `/api/users` is admin-only (R4): a caller
  // without that role simply never gets a map, and every author falls back
  // to its raw id rather than the screen failing to load its own history.
  const [authors, setAuthors] = useState<ReadonlyMap<string, string>>(new Map())

  const [fromVersion, setFromVersion] = useState<number | null>(null)
  const [toVersion, setToVersion] = useState<number | null>(null)
  const [diff, setDiff] = useState<ContentDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [undoTarget, setUndoTarget] = useState<number | null>(null)
  const [undoing, setUndoing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const found = await getHistory(token, collection, entryId)
      setVersions(found)
      const live = found.find((version) => version.live)?.version ?? null
      const oldest = found.at(-1)?.version ?? null
      setToVersion((current) => current ?? live)
      setFromVersion((current) => current ?? (oldest !== live ? oldest : null))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('versions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, collection, entryId, t])

  useEffect(() => {
    void load()
  }, [load])

  // Best-effort: a 403 here (any non-admin role) just leaves the map empty.
  useEffect(() => {
    let cancelled = false
    listUsers(token)
      .then((users) => {
        if (!cancelled) setAuthors(new Map(users.map((user) => [user.id, user.email])))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  const liveVersion = versions?.find((v) => v.live)?.version ?? null

  const versionLabel = useCallback(
    (version: VersionSummary): string =>
      `v${version.version} — ${t(`versions.status.${version.status}`, version.status)}${
        version.live ? t('versions.current') : ''
      }`,
    [t],
  )

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language],
  )

  async function compare(): Promise<void> {
    if (fromVersion === null || toVersion === null || fromVersion === toVersion) return
    setDiff(null)
    setDiffError(null)
    setDiffLoading(true)
    try {
      setDiff(await getDiff(token, collection, entryId, fromVersion, toVersion))
    } catch (caught) {
      setDiffError(caught instanceof ApiError ? caught.message : t('versions.diffError'))
    } finally {
      setDiffLoading(false)
    }
  }

  async function runRestore(version: number): Promise<void> {
    setRestoring(true)
    setRestoreError(null)
    try {
      const previousLive = liveVersion
      const entry = await restoreVersion(token, collection, entryId, version)
      onRestored(entry)
      setRestoreTarget(null)
      setUndoTarget(previousLive)
      await load()
      setDiff(null)
    } catch (caught) {
      setRestoreError(caught instanceof ApiError ? caught.message : t('versions.restoreError'))
    } finally {
      setRestoring(false)
    }
  }

  async function runUndo(version: number): Promise<void> {
    setUndoing(true)
    try {
      const entry = await restoreVersion(token, collection, entryId, version)
      onRestored(entry)
      setUndoTarget(null)
      await load()
    } catch (caught) {
      setRestoreError(caught instanceof ApiError ? caught.message : t('versions.restoreError'))
    } finally {
      setUndoing(false)
    }
  }

  const visible = versions?.slice(0, visibleCount) ?? []
  const hasMore = versions !== null && versions.length > visibleCount

  return (
    <section aria-labelledby="version-history-heading" className="version-history">
      <h2 id="version-history-heading">{t('versions.heading')}</h2>

      {loading && <p>{t('common.loading')}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {restoreError !== null && <p role="alert">{restoreError}</p>}

      {undoTarget !== null && (
        <Notice
          tone="success"
          live="polite"
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={undoing}
              onClick={() => void runUndo(undoTarget)}
            >
              {undoing ? t('versions.undoing') : t('versions.undo')}
            </Button>
          }
        >
          {t('versions.restoredNotice')}
        </Notice>
      )}

      {!loading && error === null && versions !== null && versions.length > 0 && (
        <div className="version-history__compare-panel">
          <label>
            {t('versions.compareFrom')}
            <select
              value={fromVersion ?? ''}
              onChange={(event) => setFromVersion(Number(event.target.value))}
            >
              <option value="" disabled>
                {t('versions.pickVersion')}
              </option>
              {versions.map((version) => (
                <option key={version.version} value={version.version}>
                  {versionLabel(version)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('versions.compareTo')}
            <select
              value={toVersion ?? ''}
              onChange={(event) => setToVersion(Number(event.target.value))}
            >
              <option value="" disabled>
                {t('versions.pickVersion')}
              </option>
              {versions.map((version) => (
                <option key={version.version} value={version.version}>
                  {versionLabel(version)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={fromVersion === null || toVersion === null || fromVersion === toVersion}
            onClick={() => void compare()}
          >
            {t('versions.compareButton')}
          </button>
        </div>
      )}

      {diffLoading && <p>{t('versions.computingDiff')}</p>}
      {diffError !== null && <p role="alert">{diffError}</p>}
      {diff !== null && (
        <div className="version-history__diff">
          <DiffView diff={diff} />
        </div>
      )}

      {!loading && error === null && versions !== null && (
        <>
          <ol className="version-history__list">
            {visible.map((entry) => (
              <li key={entry.version} className="version-history__item">
                {/* Not a wrapping `<label>`: the visible caption is decorative
                    (the radio already carries its own `aria-label`), and a
                    real `<label>` here would give every row's radio the same
                    accessible name as the "from"/"to" `<select>` above. */}
                <span className="version-history__radio">
                  <span className="version-history__radio-label" aria-hidden="true">
                    {t('versions.from')}
                  </span>
                  <input
                    type="radio"
                    name={`${radioName}-from`}
                    checked={fromVersion === entry.version}
                    onChange={() => setFromVersion(entry.version)}
                    aria-label={t('versions.selectAsFrom', { version: entry.version })}
                  />
                </span>
                <span className="version-history__radio">
                  <span className="version-history__radio-label" aria-hidden="true">
                    {t('versions.to')}
                  </span>
                  <input
                    type="radio"
                    name={`${radioName}-to`}
                    checked={toVersion === entry.version}
                    onChange={() => setToVersion(entry.version)}
                    aria-label={t('versions.selectAsTo', { version: entry.version })}
                  />
                </span>

                <span
                  className={`version-history__status version-history__status--${entry.status}`}
                >
                  v{entry.version} — {t(`versions.status.${entry.status}`, entry.status)}
                  {entry.live && t('versions.current')}
                </span>
                <span title={entry.createdAt}>
                  {dateFormatter.format(new Date(entry.createdAt))}
                </span>
                <span className="version-history__author">
                  {t('versions.by', { author: authorLabel(entry.createdBy, authors, t) })}
                </span>

                {!entry.live && canRestore && (
                  <div className="version-history__actions">
                    <button type="button" onClick={() => setRestoreTarget(entry)}>
                      {t('versions.restore')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {versions.length === 0 && <p>{t('versions.empty')}</p>}

          {hasMore && (
            <button
              type="button"
              className="version-history__show-more"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              {t('versions.showMore', { count: versions.length - visibleCount })}
            </button>
          )}
        </>
      )}

      <Modal
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null)
        }}
        title={t('versions.confirmRestoreTitle', { version: restoreTarget?.version ?? '' })}
        description={
          restoreTarget === null
            ? ''
            : t('versions.confirmRestoreDescription', {
                date: dateFormatter.format(new Date(restoreTarget.createdAt)),
                author: authorLabel(restoreTarget.createdBy, authors, t),
              })
        }
        closeLabel={t('versions.confirmRestoreCloseLabel')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              {t('versions.confirmRestoreCancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={restoring}
              onClick={() => {
                if (restoreTarget !== null) void runRestore(restoreTarget.version)
              }}
            >
              {restoring ? t('versions.restoring') : t('versions.confirmRestoreConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('versions.confirmRestoreWarning')}</p>
      </Modal>
    </section>
  )
}

function authorLabel(
  createdBy: string | null,
  authors: ReadonlyMap<string, string>,
  t: (key: string) => string,
): string {
  if (createdBy === null) return t('versions.unknownAuthor')
  return authors.get(createdBy) ?? createdBy
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
      {change.words !== undefined ? (
        <div className="version-history__word-diff">
          <WordDiffView words={change.words} />
        </div>
      ) : (
        <>
          {change.change !== 'added' && t('versions.before', { value: stringify(change.before) })}
          {change.change !== 'removed' && t('versions.after', { value: stringify(change.after) })}
        </>
      )}
    </li>
  )
}

/**
 * Task 06-3: "un mot corrigé apparaît comme un mot corrigé". `<del>`/`<ins>`
 * are the semantically correct elements for this — not just styled `<span>`s
 * — so a screen reader and a copy-paste both get the right thing.
 */
function WordDiffView({ words }: { readonly words: readonly WordChange[] }): JSX.Element {
  return (
    <>
      {words.map((word, index) => {
        // Whitespace-only runs carry no visible text either way; a stable key
        // needs the index since words repeat.
        const key = `${index}-${word.op}`
        if (word.op === 'equal') return <span key={key}>{word.text}</span>
        if (word.op === 'removed') {
          return (
            <del key={key} className="version-history__word-removed">
              {word.text}
            </del>
          )
        }
        return (
          <ins key={key} className="version-history__word-added">
            {word.text}
          </ins>
        )
      })}
    </>
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
