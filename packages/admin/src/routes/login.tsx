import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError, type TotpSetup } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import '../styles/auth.css'

interface LocationState {
  readonly from?: { readonly pathname: string }
}

type Step =
  | { readonly kind: 'password' }
  | { readonly kind: 'totp'; readonly ticket: string }
  | { readonly kind: 'totp-setup'; readonly ticket: string; readonly setup: TotpSetup }

/**
 * Passkeys are the spec's primary sign-in method ("passkeys en méthode
 * principale, mot de passe plus TOTP en secours"), with password-then-TOTP
 * as the fallback. Passkey *registration* — adding one to an account — needs
 * a settings surface that does not exist yet and lands with it; login does
 * not need that surface, so it ships now.
 *
 * A role that needs MFA and has no factor yet does not get turned away on
 * the password path: the password step's ticket doubles as proof it can
 * enrol TOTP right here, `totp-setup`, rather than being locked out until an
 * admin intervenes.
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
      } else if (result.status === 'mfa_required') {
        setStep({ kind: 'totp', ticket: result.ticket })
      } else {
        const setup = await auth.beginTotpSetup(result.ticket)
        setStep({ kind: 'totp-setup', ticket: result.ticket, setup })
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

  async function submitTotpSetup(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (step.kind !== 'totp-setup') return
    setError(null)
    setSubmitting(true)
    try {
      await auth.confirmTotpSetup(step.ticket, code)
      goToIntendedDestination()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('login.incorrectCode'))
    } finally {
      setSubmitting(false)
    }
  }

  if (step.kind === 'totp-setup') {
    return (
      <main className="auth-page">
        <form className="auth-form" onSubmit={submitTotpSetup} aria-labelledby="totp-setup-heading">
          <h1 id="totp-setup-heading">{t('login.totpSetupHeading')}</h1>
          <p>{t('login.totpSetupPrompt')}</p>
          <p>
            <strong>{t('login.totpSetupKeyLabel')}</strong> <code>{step.setup.secret}</code>
          </p>
          <label htmlFor="totp-setup-code">{t('login.code')}</label>
          <input
            id="totp-setup-code"
            name="totp-setup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error !== null && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {t('login.confirm')}
          </button>
        </form>
      </main>
    )
  }

  if (step.kind === 'totp') {
    return (
      <main className="auth-page">
        <form className="auth-form" onSubmit={submitTotp} aria-labelledby="totp-heading">
          <h1 id="totp-heading">{t('login.totpHeading')}</h1>
          <p>{t('login.totpPrompt')}</p>
          <label htmlFor="totp-code">{t('login.code')}</label>
          <input
            id="totp-code"
            name="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error !== null && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {t('login.verify')}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-form">
        <h1 id="login-heading">{t('login.heading')}</h1>
        <button type="button" onClick={() => void submitPasskey()} disabled={submitting}>
          {t('login.passkeyButton')}
        </button>
        <p className="auth-form__divider">{t('login.or')}</p>
        <form onSubmit={submitPassword} aria-labelledby="login-heading">
          <label htmlFor="email">{t('login.email')}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="password">{t('login.password')}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error !== null && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {t('login.submit')}
          </button>
        </form>
      </div>
    </main>
  )
}
