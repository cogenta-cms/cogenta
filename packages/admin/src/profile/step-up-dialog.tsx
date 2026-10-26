import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogError } from '../commerce/dialog-error.js'
import { Button, Field, Input, Modal } from '../ui/index.js'

export type StepUpProof = { readonly password: string } | { readonly code: string }

export interface StepUpDialogProps {
  readonly open: boolean
  /** Offer the authenticator code as an alternative to the password. */
  readonly canUseCode: boolean
  readonly busy: boolean
  /** The server's refusal of the last attempt, shown inside the dialog. */
  readonly error: string | null
  onSubmit(proof: StepUpProof): void
  onCancel(): void
}

/**
 * The re-authentication a sensitive change to the second factor asks for
 * (pentest 2026-10-26, F-01): the current password, or — for an account that
 * has an authenticator app — a current code. Shown only when the server has
 * refused the change with `AUTH_STEP_UP_REQUIRED`, so a person who just proved
 * it is never asked twice within the five minutes the server remembers.
 */
export function StepUpDialog({
  open,
  canUseCode,
  busy,
  error,
  onSubmit,
  onCancel,
}: StepUpDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [value, setValue] = useState('')

  // A fresh, empty dialog each time it opens: a secret typed for the last
  // attempt must not still be sitting in the field.
  useEffect(() => {
    if (open) {
      setMode('password')
      setValue('')
    }
  }, [open])

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (value === '') return
    onSubmit(mode === 'password' ? { password: value } : { code: value.trim() })
  }

  const usingCode = mode === 'code'
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={t('profile.stepUpTitle')}
      description={usingCode ? t('profile.stepUpIntroCode') : t('profile.stepUpIntro')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="step-up-form" disabled={busy || value === ''}>
            {t('profile.stepUpConfirm')}
          </Button>
        </>
      }
    >
      <form id="step-up-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={usingCode ? t('profile.stepUpCode') : t('profile.stepUpPassword')}>
          {(control) => (
            <Input
              {...control}
              key={mode}
              type={usingCode ? 'text' : 'password'}
              inputMode={usingCode ? 'numeric' : undefined}
              autoComplete={usingCode ? 'one-time-code' : 'current-password'}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </Field>
        {canUseCode && (
          <div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMode(usingCode ? 'password' : 'code')
                setValue('')
              }}
            >
              {usingCode ? t('profile.stepUpUsePassword') : t('profile.stepUpUseCode')}
            </Button>
          </div>
        )}
        <DialogError message={error} />
      </form>
    </Modal>
  )
}
