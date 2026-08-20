import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  BlockChange,
  ChangeKind,
  ContentDiff,
  FieldChange,
  WordChange,
} from '../api/content-client.js'

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
