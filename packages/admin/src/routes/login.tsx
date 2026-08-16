import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Card, CardBody, Field, Input, Notice } from '../ui/index.js'

interface LocationState {
  readonly from?: { readonly pathname: string }
}

type Step = { readonly kind: 'password' } | { readonly kind: 'totp'; readonly ticket: string }

/**
 * Passkeys are the spec's primary sign-in method ("passkeys en méthode
 * principale, mot de passe plus TOTP en secours"), with password-then-TOTP
 * as the fallback.
 *
 * There used to be a third step here: an account whose role required MFA and
 * had no factor yet was walked through a TOTP enrolment before it could get a
 * session. ADR-0021 removed it. A correct password is enough for every role,
 * including `admin`; the second factor is offered from the profile and
 * recommended by a persistent notice in the admin, and this screen only ever
 * asks for a code from someone who already chose to enrol one.
 */
export function LoginRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (auth.state.status === 'authenticated') {
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  function goToIntendedDestination(): void {
    navigate((location.state as LocationState | null)?.from?.pathname ?? '/', { replace: true })
  }

  async function submitPasskey(): Promise<void> {
    setError(null)
    setSubmitting(true)
    try {
      await auth.loginWithPasskey()
      goToIntendedDestination()
    } catch (caught) {
      // A cancelled browser prompt throws too, and is not worth an alarming
      // message — "try again" covers both that and a genuine failure.
      setError(caught instanceof ApiError ? caught.message : t('login.passkeyRefused'))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await auth.login(email, password)
      if (result.status === 'session') {
        goToIntendedDestination()
      } else {
        setStep({ kind: 'totp', ticket: result.ticket })
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('login.connectionFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitTotp(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (step.kind !== 'totp') return
    setError(null)
    setSubmitting(true)
    try {
      await auth.completeTotp(step.ticket, code)
      goToIntendedDestination()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('login.incorrectCode'))
    } finally {
      setSubmitting(false)
    }
  }

  if (step.kind === 'totp') {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardBody>
            <form
              onSubmit={submitTotp}
              aria-labelledby="totp-heading"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <h1 id="totp-heading" className="m-0 text-xl leading-7 font-semibold">
                  {t('login.totpHeading')}
                </h1>
                <p className="m-0 text-sm text-muted-foreground">{t('login.totpPrompt')}</p>
              </div>
              <Field label={t('login.code')}>
                {(control) => (
                  <Input
                    {...control}
                    name="totp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                )}
              </Field>
              {error !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{error}</p>
                </Notice>
              )}
              <Button type="submit" disabled={submitting}>
                {t('login.verify')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h1 id="login-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('login.heading')}
          </h1>
          <Button variant="secondary" onClick={() => void submitPasskey()} disabled={submitting}>
            {t('login.passkeyButton')}
          </Button>
          <p className="m-0 text-center text-sm text-muted-foreground">{t('login.or')}</p>
          <form
            onSubmit={submitPassword}
            aria-labelledby="login-heading"
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
                />
              )}
            </Field>
            <Field label={t('login.password')}>
              {(control) => (
                <Input
                  {...control}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            {error !== null && (
              <Notice tone="danger" live="assertive">
                <p>{error}</p>
              </Notice>
            )}
            <Button type="submit" disabled={submitting}>
              {t('login.submit')}
            </Button>
          </form>
          <p className="m-0 text-center text-sm text-muted-foreground">
            <Link to="/forgot-password" className="text-primary hover:underline">
              {t('login.forgotPassword')}
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  )
}
