import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Notice } from '../ui/index.js'

/**
 * The one confirmation the trash screen still needs (fiche 07 task 2):
 * purging is the single genuinely irreversible action in this admin, so it
 * gets the design system's modal — never `globalThis.confirm()` — naming
 * the exact count it is about to destroy.
 *
 * Shared by three call sites that are really the same action at a different
 * scale: a single row's "delete for good", "delete the selection", and
 * "empty this collection's trash". All three show the same exact count and
 * the same wording; only the heading differs by scope.
 *
 * Above ten entries, confirming also requires typing a fixed word — the
 * same escalation GitHub and others use for an action this size: a click is
 * cheap to make by reflex, typing a word is not.
 */

const TYPED_CONFIRMATION_THRESHOLD = 10

export interface PurgeConfirmModalProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  /** Exact number of entries this confirmation would destroy — never rounded, never estimated. */
  readonly count: number
  /** "selection" for the rows an actor picked; "collection" for "empty this collection's trash". */
  readonly scope: 'selection' | 'collection'
  /** Only meaningful for `scope: 'collection'`. */
  readonly collectionLabel?: string
  readonly busy: boolean
  onConfirm(): void
}

export function PurgeConfirmModal({
  open,
  onOpenChange,
  count,
  scope,
  collectionLabel,
  busy,
  onConfirm,
}: PurgeConfirmModalProps): JSX.Element {
  const { t } = useTranslation()
  const [typedWord, setTypedWord] = useState('')

  const requiresTypedWord = count > TYPED_CONFIRMATION_THRESHOLD
  const confirmationWord = t('trash.purgeConfirmWord')
  const wordMatches = typedWord.trim().toUpperCase() === confirmationWord.toUpperCase()
  const canConfirm = !busy && (!requiresTypedWord || wordMatches)

  const title =
    scope === 'collection'
      ? t('trash.emptyTitle', { collection: collectionLabel ?? '' })
      : t('trash.purgeSelectionTitle', { count })

  function handleOpenChange(next: boolean): void {
    if (!next) setTypedWord('')
    onOpenChange(next)
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      closeLabel={t('trash.closeModal')}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={!canConfirm} onClick={onConfirm}>
            {busy ? t('trash.purging') : t('trash.confirmPurge', { count })}
          </Button>
        </>
      }
    >
      <Notice tone="danger" live="off">
        <p>{t('trash.purgeIrreversible', { count })}</p>
      </Notice>

      {requiresTypedWord && (
        <Field
          label={t('trash.typeToConfirm', { word: confirmationWord })}
          description={t('trash.typeToConfirmHint')}
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              value={typedWord}
              onChange={(event) => setTypedWord(event.target.value)}
            />
          )}
        </Field>
      )}
    </Modal>
  )
}
