import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError, getPasswordPolicy, resetPassword } from '../api/client.js'
import { Button, Card, CardBody, Field, Input, Notice } from '../ui/index.js'

/** The floor this screen falls back to before `getPasswordPolicy()` answers — matches the server's own default (`password-policy.ts`), never a guess that could be wrong. */
const DEFAULT_MIN_LENGTH = 12

/**
 * The other half of `forgot-password.tsx` — the screen the link in the mail
 * `sendResetMail` (`@cogenta/cli`) sends actually opens.
 *
 * `token` travels as a query parameter because that is what a mail link can
 * carry; it is never displayed back, never logged, and the only thing this
 * screen does with it is hand it once to `POST /api/auth/reset-password`,
 * which consumes it (`resets.ts`'s single-use guarantee).
 */
export function ResetPasswordRoute(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Fiche 18 task 3: fetched rather than recopied by hand, so the floor
  // announced here can never drift from what the server actually enforces.
  const [minLength, setMinLength] = useState(DEFAULT_MIN_LENGTH)

  useEffect(() => {
    getPasswordPolicy()
      .then((policy) => setMinLength(policy.minLength))
      .catch(() => undefined)
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword(token, newPassword)
      setDone(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('resetPassword.error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (token === '') {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardBody>
            <Notice tone="danger" live="assertive">
              <p>{t('resetPassword.missingToken')}</p>
            </Notice>
            <p className="m-0 text-center text-sm">
              <Link to="/forgot-password">{t('forgotPassword.heading')}</Link>
            </p>
          </CardBody>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardBody>
          <div className="flex flex-col gap-1.5">
            <h1 id="reset-password-heading" className="m-0 text-xl leading-7 font-semibold">
              {t('resetPassword.heading')}
            </h1>
          </div>

          {done ? (
            <>
              <Notice tone="success" live="assertive">
                <p>{t('resetPassword.done')}</p>
              </Notice>
              <Button onClick={() => navigate('/login')}>{t('resetPassword.goToLogin')}</Button>
            </>
          ) : (
            <form
              onSubmit={submit}
              aria-labelledby="reset-password-heading"
              className="flex flex-col gap-4"
            >
              <Field
                label={t('resetPassword.newPassword')}
                description={t('resetPassword.hint', { minLength })}
              >
                {(control) => (
                  <Input
                    {...control}
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={minLength}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                )}
              </Field>
              {newPassword.length > 0 && (
                <p
                  className={
                    newPassword.length >= minLength
                      ? 'm-0 text-sm text-success'
                      : 'm-0 text-sm text-destructive'
                  }
                  role="status"
                >
                  {newPassword.length >= minLength
                    ? t('resetPassword.strengthOk')
                    : t('resetPassword.strengthShort', {
                        remaining: minLength - newPassword.length,
                      })}
                </p>
              )}
              {error !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{error}</p>
                </Notice>
              )}
              <Button type="submit" disabled={submitting}>
                {t('resetPassword.submit')}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  )
}
