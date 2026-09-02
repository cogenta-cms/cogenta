import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError, forgotPassword } from '../api/client.js'
import { AuthLayout } from '../auth/auth-layout.js'
import { Button, Card, CardBody, Field, Input, Notice } from '../ui/index.js'

/**
 * "Mot de passe oublié ?" — the door `login.tsx` had no way to open.
 *
 * `packages/auth/src/resets.ts`'s store and `cogenta users reset-password`
 * already existed; this screen and `reset-password.tsx` are the two pieces
 * that were missing to reach the same flow from a browser instead of a
 * terminal.
 *
 * **The one rule this screen exists to honour**: the confirmation shown is
 * the exact same sentence whether or not the address turns out to belong to
 * a real account, and it never branches on the response beyond a network
 * failure — `forgotPassword()` already returns identically either way
 * (`auth-router.ts`), so this component would have to go out of its way to
 * leak what the server took care not to.
 */
export function ForgotPasswordRoute(): JSX.Element {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await forgotPassword(email)
      // Shown on any successful call, regardless of what the server actually
      // did with it — there is nothing in the response to branch on.
      setSubmitted(true)
    } catch (caught) {
      // A genuine failure to reach the server (network down, 5xx) is not the
      // same thing as "no such account" and is allowed to say so — it never
      // mentions the account itself.
      setError(caught instanceof ApiError ? caught.message : t('forgotPassword.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
        <CardBody>
          <div className="flex flex-col gap-1.5">
            <h1
              id="forgot-password-heading"
              className="m-0 text-xl leading-7 font-semibold tracking-tight"
            >
              {t('forgotPassword.heading')}
            </h1>
            <p className="m-0 text-sm text-muted-foreground">{t('forgotPassword.intro')}</p>
          </div>

          {submitted ? (
            <Notice tone="success" live="polite">
              <p>{t('forgotPassword.sent')}</p>
            </Notice>
          ) : (
            <form
              onSubmit={submit}
              aria-labelledby="forgot-password-heading"
              className="flex flex-col gap-4"
            >
              <Field label={t('login.email')}>
                {(control) => (
                  <Input
                    {...control}
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11"
                  />
                )}
              </Field>
              {error !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{error}</p>
                </Notice>
              )}
              <Button type="submit" disabled={submitting} className="h-11 rounded-full">
                {t('forgotPassword.submit')}
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
