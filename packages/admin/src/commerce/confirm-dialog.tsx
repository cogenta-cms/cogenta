import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui/index.js'
import { DialogError } from './dialog-error.js'

export interface ConfirmDialogProps {
  readonly open: boolean
  readonly title: string
  /** What is about to happen, and (for a destructive action) that it cannot be undone. */
  readonly children: ReactNode
  readonly confirmLabel: string
  /** A red confirm button, for something the person cannot take back. */
  readonly destructive?: boolean
  readonly busy?: boolean
  /** The server's refusal, shown inside the dialog. */
  readonly error?: string | null
  onConfirm(): void
  onCancel(): void
}

/**
 * The confirmation every irreversible shop action goes through — cancelling an
 * order, deleting a tax rule, ending a subscription, removing a variant. A
 * plain click on the screen's own button never does the thing; it opens this.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  destructive = true,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={title}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-6">{children}</div>
      <DialogError message={error} />
    </Modal>
  )
}
