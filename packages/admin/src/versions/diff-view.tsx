import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { BlockChange, ChangeKind, ContentDiff, FieldChange } from '../api/content-client.js'

/**
 * The structural diff renderer, extracted from `version-history.tsx` (L2
 * task 10) so the audit log's entry detail (fiche 21 task 1) can show the
 * exact same rendering of `GET .../diff`'s output rather than a second,
 * drifting implementation — "ne pas dupliquer le diff" applies to the UI
 * just as much as to the server route that computes it.
 */
export function DiffView({ diff }: { readonly diff: ContentDiff }): JSX.Element {
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
