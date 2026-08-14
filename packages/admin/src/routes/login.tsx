import { type FormEvent, type JSX, useState } from 'react'
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
      setError(
        caught instanceof ApiError ? caught.message : 'La clé d’accès a été refusée ou annulée.',
      )
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
      setError(caught instanceof ApiError ? caught.message : 'Connexion impossible.')
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
      setError(caught instanceof ApiError ? caught.message : 'Code incorrect.')
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
      setError(caught instanceof ApiError ? caught.message : 'Code incorrect.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step.kind === 'totp-setup') {
    return (
      <main className="auth-page">
        <form className="auth-form" onSubmit={submitTotpSetup} aria-labelledby="totp-setup-heading">
          <h1 id="totp-setup-heading">Configurer la vérification en deux étapes</h1>
          <p>
            Ce rôle exige un second facteur. Scannez ce code dans une application d'authentification
            (Google Authenticator, 1Password…), ou saisissez la clé manuellement, puis entrez le
            code affiché.
          </p>
          <p>
            <strong>Clé :</strong> <code>{step.setup.secret}</code>
          </p>
          <label htmlFor="totp-setup-code">Code</label>
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
            Confirmer
          </button>
        </form>
      </main>
    )
  }

  if (step.kind === 'totp') {
    return (
      <main className="auth-page">
        <form className="auth-form" onSubmit={submitTotp} aria-labelledby="totp-heading">
          <h1 id="totp-heading">Code de vérification</h1>
          <p>Entrez le code à 6 chiffres de votre application d'authentification.</p>
          <label htmlFor="totp-code">Code</label>
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
            Vérifier
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-form">
        <h1 id="login-heading">Connexion à Cogenta</h1>
        <button type="button" onClick={() => void submitPasskey()} disabled={submitting}>
          Se connecter avec une clé d'accès
        </button>
        <p className="auth-form__divider">ou</p>
        <form onSubmit={submitPassword} aria-labelledby="login-heading">
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="password">Mot de passe</label>
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
            Se connecter
          </button>
        </form>
      </div>
    </main>
  )
}
