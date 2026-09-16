import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setEntryVisibility } from '../api/content-client.js'
import { describeApiError } from '../api/describe-error.js'
import { Button, Card, CardBody, Field, Input, Notice, Select } from '../ui/index.js'

/**
 * « Visibilité » — who may see this entry once it is published
 * (`schema@2.2`, ADR-0034), the control WordPress puts in the same place.
 *
 * Three states and one decision each:
 *
 * - **Publique** — everyone.
 * - **Privée** — only people who could edit this collection. A visitor gets a
 *   404, not a refusal: for a note nobody should see, its existence is
 *   already the information.
 * - **Protégée** — published, listed, linkable, and asking for a password
 *   before it shows its content.
 *
 * Applied on its own button rather than on the form's save, because the
 * server gates it on `publish` while the form gates on `update`: folding it
 * into the ordinary save would either hand it to anyone who may fix a typo,
 * or make a typo fix fail for someone who may not publish.
 *
 * The password is sent once. Nothing ever reads it back — not this screen,
 * not the API — so the field is blank on every visit, and leaving it blank on
 * an entry that is already protected keeps the password it has.
 */

export type EntryVisibility = 'public' | 'private' | 'password'

export interface VisibilityCardProps {
  readonly token: string
  readonly collection: string
  readonly entryId: string
  readonly current: EntryVisibility
  onChanged(visibility: EntryVisibility): void
}

export function VisibilityCard({
  token,
  collection,
  entryId,
  current,
  onChanged,
}: VisibilityCardProps): JSX.Element {
  const { t } = useTranslation()
  const [choice, setChoice] = useState<EntryVisibility>(current)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const needsPassword = choice === 'password' && current !== 'password' && password.trim() === ''
  const unchanged = choice === current && password.trim() === ''

  const apply = (): void => {
    setBusy(true)
    setError(null)
    setDone(false)
    setEntryVisibility(token, collection, entryId, {
      visibility: choice,
      ...(choice === 'password' && password.trim() !== '' ? { password } : {}),
    })
      .then(() => {
        setPassword('')
        setDone(true)
        onChanged(choice)
      })
      .catch((caught: unknown) => {
        setError(describeApiError(caught, t('entryEdit.visibility.failed')).message)
        setChoice(current)
      })
      .finally(() => setBusy(false))
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          {t('entryEdit.visibility.label')}
        </span>
        <Select
          aria-label={t('entryEdit.visibility.label')}
          value={choice}
          disabled={busy}
          onChange={(event) => {
            setChoice(event.target.value as EntryVisibility)
            setDone(false)
          }}
        >
          <option value="public">{t('entryEdit.visibility.public')}</option>
          <option value="private">{t('entryEdit.visibility.private')}</option>
          <option value="password">{t('entryEdit.visibility.password')}</option>
        </Select>
        <p className="m-0 text-xs text-muted-foreground">
          {t(`entryEdit.visibility.explain.${choice}`)}
        </p>

        {choice === 'password' && (
          <Field
            label={t('entryEdit.visibility.passwordLabel')}
            description={
              current === 'password' ? t('entryEdit.visibility.passwordKeep') : undefined
            }
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
        )}

        {error !== null && (
          <Notice tone="danger" live="polite">
            <p>{error}</p>
          </Notice>
        )}
        {done && (
          <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
            {t('entryEdit.visibility.saved')}
          </p>
        )}

        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || unchanged || needsPassword}
            onClick={apply}
          >
            {t('entryEdit.visibility.apply')}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
