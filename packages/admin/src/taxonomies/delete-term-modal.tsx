import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import type { Term } from '../api/taxonomy-client.js'
import { Button, Modal, Notice } from '../ui/index.js'

/**
 * Informed deletion (`08-taxonomies.md`, task 4) — a modal of the design
 * system, never `confirm()`, saying exactly what the server will do before
 * it does it: how many entries lose this term, how many descendant terms go
 * with it, and — when there are any — the two real outcomes, cascade or
 * cancel, rather than a plain delete button that the server would refuse.
 */

export interface DeleteTermModalProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly term: Term | null
  /** Direct and indirect descendant terms — `0` means nothing to cascade. */
  readonly descendantCount: number
  /** Entries classified with this term directly. `null` while still loading. */
  readonly ownCount: number | null
  onConfirm(cascade: boolean): Promise<void>
}

export function DeleteTermModal({
  open,
  onOpenChange,
  term,
  descendantCount,
  ownCount,
  onConfirm,
}: DeleteTermModalProps): JSX.Element | null {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (term === null) return null

  async function confirm(cascade: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(cascade)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const label = term.labels.fr ?? term.labels.en ?? Object.values(term.labels)[0] ?? term.slug
  const loading = ownCount === null

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('taxonomies.deleteTitle', { term: label })}
      closeLabel={t('common.cancel')}
      footer={
        loading ? undefined : descendantCount > 0 ? (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirm(true)}>
              {t('taxonomies.deleteCascade', { count: descendantCount })}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirm(false)}>
              {t('taxonomies.confirmDelete')}
            </Button>
          </>
        )
      }
    >
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {loading ? (
        <p>{t('taxonomies.deleteChecking')}</p>
      ) : (
        <>
          <p>
            {ownCount === 0
              ? t('taxonomies.deleteNoEntries')
              : t('taxonomies.deleteEntryCount', { count: ownCount })}
          </p>
          {descendantCount > 0 && (
            <Notice tone="warning">
              <p>{t('taxonomies.deleteHasChildren', { count: descendantCount })}</p>
            </Notice>
          )}
        </>
      )}
    </Modal>
  )
}
