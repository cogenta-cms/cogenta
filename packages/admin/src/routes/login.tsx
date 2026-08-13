import { type FormEvent, type JSX, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import '../styles/auth.css'

interface LocationState {
  readonly from?: { readonly pathname: string }
}

/**
 * Password-then-TOTP, per `docs/lots/L2-admin.md`: "mot de passe plus TOTP en
 * secours". Passkeys are the primary method the spec asks for, but they need
 * a ceremony the backend does not expose yet (tracked alongside task 3) —
 * this is the fallback path, built first because it has no such dependency.
 */
export function LoginRoute(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpTicket, setTotpTicket] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (auth.state.status === 'authenticated') {
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await auth.login(email, password)
      if (result.status === 'mfa_required') {
        setTotpTicket(result.ticket)
      } else {
        navigate((location.state as LocationState | null)?.from?.pathname ?? '/', { replace: true })
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Connexion impossible.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitTotp(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (totpTicket === null) return
    setError(null)
    setSubmitting(true)
    try {
      await auth.completeTotp(totpTicket, totpCode)
      navigate((location.state as LocationState | null)?.from?.pathname ?? '/', { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Code incorrect.')
    } finally {
      setSubmitting(false)
    }
  }

  if (totpTicket !== null) {
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
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value)}
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
      <form className="auth-form" onSubmit={submitPassword} aria-labelledby="login-heading">
        <h1 id="login-heading">Connexion à Cogenta</h1>
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
    </main>
  )
}
