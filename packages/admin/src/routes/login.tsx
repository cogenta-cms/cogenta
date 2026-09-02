import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { AuthLayout } from '../auth/auth-layout.js'
import { Button, Card, CardBody, Field, Input, Notice } from '../ui/index.js'

interface LocationState {
  readonly from?: { readonly pathname: string }
}

type Step =
  | { readonly kind: 'password' }
  | { readonly kind: 'totp'; readonly ticket: string }
  /** Fiche 18 task 1 — the way back in when the authenticator behind the TOTP step is unavailable. */
  | { readonly kind: 'recovery'; readonly ticket: string }

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
 *
 * The brand mark, tagline and feature highlights that used to sit above the
 * card here now live in `AuthLayout`'s dark rail (`src/auth/auth-layout.tsx`)
 * — shared with `forgot-password.tsx`/`reset-password.tsx` rather than
 * redrawn on every screen.
 */
export function LoginRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Checked by default: this is the sliding 30-day session the site already
  // gave everyone before "remember me" existed (fiche 18 task 5) — the box
  // only ever asks for a *shorter* one when unchecked, never a regression.
  const [rememberMe, setRememberMe] = useState(true)
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * `ApiError#message` is the server's own English string (`@cogenta/auth`
   * never localises it — a stable log/API contract, not UI copy). Falling
   * back to it unconditionally was showing "Incorrect email or password."
   * in the middle of an otherwise French screen. `@cogenta/auth` reuses the
   * same handful of codes (`AUTH_INVALID_CREDENTIALS` in particular) across
   * password, TOTP and recovery-code checks with a different meaning each
   * time, so the right translation is whichever key the *caller* already
   * expects for its own step — this only ever substitutes on a code the
   * step in question is known to actually produce; anything else falls back
   * to the raw server message rather than guess at a translation for it.
   */
  function loginErrorMessage(
    caught: unknown,
    networkFailureKey: string,
    expectedKey: string = networkFailureKey,
  ): string {
    if (!(caught instanceof ApiError)) return t(networkFailureKey)
    switch (caught.code) {
      case 'AUTH_INVALID_CREDENTIALS':
      case 'AUTH_USER_NOT_FOUND':
      case 'AUTH_RECOVERY_CODE_INVALID':
      case 'AUTH_WEBAUTHN_FAILED':
        return t(expectedKey)
      default:
        return caught.message
    }
  }

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
      setError(loginErrorMessage(caught, 'login.passkeyRefused'))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await auth.login(email, password, rememberMe)
      if (result.status === 'session') {
        goToIntendedDestination()
      } else {
        setStep({ kind: 'totp', ticket: result.ticket })
      }
    } catch (caught) {
      setError(loginErrorMessage(caught, 'login.connectionFailed', 'login.incorrectPassword'))
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
      setError(loginErrorMessage(caught, 'login.incorrectCode'))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitRecoveryCode(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (step.kind !== 'recovery') return
    setError(null)
    setSubmitting(true)
    try {
      await auth.completeRecoveryCode(step.ticket, recoveryCode)
      goToIntendedDestination()
    } catch (caught) {
      setError(loginErrorMessage(caught, 'login.recoveryCodeIncorrect'))
    } finally {
      setSubmitting(false)
    }
  }

  if (step.kind === 'totp') {
    return (
      <AuthLayout>
        <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
          <CardBody>
            <form
              onSubmit={submitTotp}
              aria-labelledby="totp-heading"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <h1
                  id="totp-heading"
                  className="m-0 text-xl leading-7 font-semibold tracking-tight"
                >
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
                {t('login.verify')}
              </Button>
              <button
                type="button"
                className="m-0 cursor-pointer border-0 bg-transparent p-0 text-center text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setError(null)
                  setRecoveryCode('')
                  setStep({ kind: 'recovery', ticket: step.ticket })
                }}
              >
                {t('login.useRecoveryCode')}
              </button>
            </form>
          </CardBody>
        </Card>
      </AuthLayout>
    )
  }

  if (step.kind === 'recovery') {
    return (
      <AuthLayout>
        <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
          <CardBody>
            <form
              onSubmit={submitRecoveryCode}
              aria-labelledby="recovery-heading"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <h1
                  id="recovery-heading"
                  className="m-0 text-xl leading-7 font-semibold tracking-tight"
                >
                  {t('login.recoveryHeading')}
                </h1>
                <p className="m-0 text-sm text-muted-foreground">{t('login.recoveryPrompt')}</p>
              </div>
              <Field label={t('login.code')}>
                {(control) => (
                  <Input
                    {...control}
                    name="recovery-code"
                    autoComplete="one-time-code"
                    required
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
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
                {t('login.verify')}
              </Button>
              <button
                type="button"
                className="m-0 cursor-pointer border-0 bg-transparent p-0 text-center text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setError(null)
                  setCode('')
                  setStep({ kind: 'totp', ticket: step.ticket })
                }}
              >
                {t('login.useTotpCode')}
              </button>
            </form>
          </CardBody>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="reveal w-full max-w-sm rounded-xl shadow-raised">
        <CardBody>
          <h1 id="login-heading" className="m-0 text-xl leading-7 font-semibold tracking-tight">
            {t('login.heading')}
          </h1>
          <Button
            variant="secondary"
            onClick={() => void submitPasskey()}
            disabled={submitting}
            className="h-11 rounded-full"
          >
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
                  className="h-11"
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
                  className="h-11"
                />
              )}
            </Field>
            <label className="flex items-center gap-2 font-sans text-sm leading-5 text-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded-sm border border-input accent-primary"
              />
              {t('login.rememberMe')}
            </label>
            {error !== null && (
              <Notice tone="danger" live="assertive">
                <p>{error}</p>
              </Notice>
            )}
            <Button type="submit" disabled={submitting} className="h-11 rounded-full">
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
    </AuthLayout>
  )
}
