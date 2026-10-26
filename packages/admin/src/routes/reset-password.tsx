import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError, getPasswordPolicy, resetPassword } from '../api/client.js'
import { AuthLayout } from '../auth/auth-layout.js'
import { PasswordInput } from '../auth/password-input.js'
import { useDocumentTitle } from '../shell/use-document-title.js'
import { Button, Card, CardBody, Field, Notice } from '../ui/index.js'

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
  useDocumentTitle(t('resetPassword.pageTitle'))
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A link that no longer works is not a typo in the password: the person has
  // to ask for a new one, so the notice carries the way to do it.
  const [linkRejected, setLinkRejected] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
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
    setLinkRejected(false)
    if (newPassword === '') {
      setFieldError(t('auth.passwordRequired'))
      return
    }
    if (newPassword.length < minLength) {
      setFieldError(t('resetPassword.tooShort', { count: minLength }))
      return
    }
    setFieldError(null)
    setSubmitting(true)
    try {
      await resetPassword(token, newPassword)
      setDone(true)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'AUTH_RESET_TOKEN_INVALID') {
        // The server's wording is English and technical; the screen's own
        // sentence says what to do about it.
        setLinkRejected(true)
        setError(t('resetPassword.linkInvalid'))
      } else {
        setError(caught instanceof ApiError ? caught.message : t('resetPassword.error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (token === '') {
    return (
      <AuthLayout>
        <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
          <CardBody>
            <h1 className="m-0 text-xl leading-7 font-semibold tracking-tight">
              {t('resetPassword.heading')}
            </h1>
            <Notice tone="danger" live="assertive">
              <p>{t('resetPassword.missingToken')}</p>
            </Notice>
            <Link
              to="/forgot-password"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground no-underline hover:opacity-90"
            >
              {t('resetPassword.requestNewLink')}
            </Link>
            <p className="m-0 text-center text-sm">
              <Link to="/login" className="text-primary hover:underline">
                {t('forgotPassword.backToLogin')}
              </Link>
            </p>
          </CardBody>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
        <CardBody>
          <div className="flex flex-col gap-1.5">
            <h1
              id="reset-password-heading"
              className="m-0 text-xl leading-7 font-semibold tracking-tight"
            >
              {t('resetPassword.heading')}
            </h1>
          </div>

          {done ? (
            <>
              <Notice tone="success" live="assertive">
                <p>{t('resetPassword.done')}</p>
              </Notice>
              <Button onClick={() => navigate('/login')} className="h-11 rounded-full">
                {t('resetPassword.goToLogin')}
              </Button>
            </>
          ) : (
            <form
              onSubmit={submit}
              noValidate
              aria-labelledby="reset-password-heading"
              className="flex flex-col gap-4"
            >
              <Field
                label={t('resetPassword.newPassword')}
                description={t('resetPassword.hint', { minLength })}
                error={fieldError}
              >
                {(control) => (
                  <PasswordInput
                    {...control}
                    name="new-password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="h-11"
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
                        count: minLength - newPassword.length,
                      })}
                </p>
              )}
              {error !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{error}</p>
                </Notice>
              )}
              {linkRejected && (
                <Link
                  to="/forgot-password"
                  className="text-center text-sm text-primary hover:underline"
                >
                  {t('resetPassword.requestNewLink')}
                </Link>
              )}
              <Button type="submit" disabled={submitting} className="h-11 rounded-full">
                {t('resetPassword.submit')}
              </Button>
            </form>
          )}
          <p className="m-0 text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              {t('forgotPassword.backToLogin')}
            </Link>
          </p>
        </CardBody>
      </Card>
    </AuthLayout>
  )
}
