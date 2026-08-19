import { type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSlate } from 'slate-react'
import { getEntry } from '../api/content-client.js'
import { Button, Input, Label } from '../ui/index.js'
import { activeLink, insertInternalLink, insertLink, isLinkActive, removeLink } from './commands.js'
import { InternalLinkPicker } from './internal-link-picker.js'
import type { RichTextSession } from './session.js'

type Tab = 'external' | 'internal'

interface TargetStatus {
  readonly status: string
  readonly trashed: boolean
}

/**
 * The link button's panel (fiche 04 task 2): external URL — the existing
 * behaviour, unchanged — or an internal entry, picked through
 * `InternalLinkPicker` and stored as `{ collection, entryId }`, never a URL
 * (ADR-0013), so renaming the target's slug cannot break it.
 *
 * Reopening the panel on a link the cursor is already inside shows what is
 * there: for an internal link, its live status is looked up (`trashed:
 * 'include'`, since a stale target must warn *as* stale, not disappear as
 * unreadable) so the editor can see before publishing that the target is a
 * draft or in the trash — the two cases fiche 04 names explicitly.
 */
export function LinkPopover({
  session,
  disabled,
  onClose,
}: {
  readonly session: RichTextSession | undefined
  readonly disabled: boolean
  onClose(): void
}): JSX.Element {
  const { t } = useTranslation()
  const editor = useSlate()
  const urlId = useId()
  const existing = activeLink(editor)

  const [tab, setTab] = useState<Tab>(existing?.kind === 'internal' ? 'internal' : 'external')
  const [url, setUrl] = useState(existing?.kind === 'external' ? existing.href : '')
  const [targetStatus, setTargetStatus] = useState<TargetStatus | null>(null)

  const existingTarget =
    existing?.kind === 'internal' ? `${existing.collection}:${existing.entryId}` : null

  useEffect(() => {
    if (existingTarget === null || session === undefined) {
      setTargetStatus(null)
      return
    }
    const [targetCollection, targetId] = existingTarget.split(':') as [string, string]
    let cancelled = false
    getEntry(session.token, targetCollection, targetId, { trashed: 'include' })
      .then((entry) => {
        if (!cancelled) setTargetStatus({ status: entry.status, trashed: entry.deletedAt !== null })
      })
      .catch(() => {
        if (!cancelled) setTargetStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [session, existingTarget])

  function confirmExternal(): void {
    const trimmed = url.trim()
    if (trimmed === '') return
    insertLink(editor, trimmed)
    onClose()
  }

  function confirmInternal(collection: string, id: string): void {
    insertInternalLink(editor, collection, id)
    onClose()
  }

  return (
    <div className="rich-text-toolbar__link-panel flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-card">
      {isLinkActive(editor) && (
        <div className="flex flex-wrap items-center gap-2">
          {targetStatus?.trashed && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
              {t('richText.linkTargetTrashed')}
            </span>
          )}
          {targetStatus !== null &&
            !targetStatus.trashed &&
            targetStatus.status !== 'published' && (
              <span className="rounded-full bg-warning-surface px-2 py-0.5 text-xs font-semibold text-warning">
                {t('richText.linkTargetDraft')}
              </span>
            )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              removeLink(editor)
              onClose()
            }}
          >
            {t('richText.removeLink')}
          </Button>
        </div>
      )}

      <div className="flex gap-2" role="tablist" aria-label={t('richText.linkTabsLabel')}>
        <Button
          type="button"
          size="sm"
          variant={tab === 'external' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={tab === 'external'}
          onClick={() => setTab('external')}
        >
          {t('richText.linkTabExternal')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'internal' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={tab === 'internal'}
          disabled={session === undefined}
          onClick={() => setTab('internal')}
        >
          {t('richText.linkTabInternal')}
        </Button>
      </div>

      {tab === 'external' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={urlId}>{t('richText.linkUrlLabel')}</Label>
          <Input
            id={urlId}
            type="url"
            placeholder={t('richText.linkPlaceholder')}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmExternal()
              }
              if (event.key === 'Escape') onClose()
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || url.trim() === ''}
            onClick={confirmExternal}
          >
            {t('richText.linkConfirm')}
          </Button>
        </div>
      ) : session === undefined ? (
        <p role="alert">{t('richText.linkInternalUnavailable')}</p>
      ) : (
        <InternalLinkPicker
          token={session.token}
          roles={session.roles}
          collections={session.collections}
          disabled={disabled}
          onPick={confirmInternal}
        />
      )}
    </div>
  )
}
