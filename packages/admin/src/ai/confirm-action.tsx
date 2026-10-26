import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui/index.js'

export interface ConfirmActionProps {
  readonly open: boolean
  readonly title: string
  /** What is about to happen and, for a removal, that it cannot be taken back. */
  readonly children: ReactNode
  readonly confirmLabel: string
  readonly busy?: boolean
  /** A red confirm button, for what cannot be undone. Defaults to true. */
  readonly destructive?: boolean
  onConfirm(): void
  onCancel(): void
}

/**
 * The confirmation every removal on the AI screens goes through — an agent, a
 * skill, a provider (and its saved key), a plan proposal, a reference
 * document. A click on the row's own button never removes anything; it opens
 * this, and only the confirm button does.
 */
export function ConfirmAction({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmActionProps): JSX.Element {
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
    </Modal>
  )
}
