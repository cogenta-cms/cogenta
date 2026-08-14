import { type FormEvent, type JSX, useState } from 'react'
import { ApiError, registerPasskey } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'

/**
 * L2 task 3's remaining half: login.tsx already covers passkeys as the
 * primary sign-in method, but adding one to an already-signed-in account
 * needs its own surface — this is that surface, the "settings page" that
 * comment forward-referenced.
 */
export function SettingsRoute(): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null

  const [label, setLabel] = useState('')
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setError(null)
    setSuccess(false)
    setRegistering(true)
    try {
      await registerPasskey(token, label === '' ? undefined : label)
      setSuccess(true)
      setLabel('')
    } catch (caught) {
      // A cancelled browser prompt throws too — same reasoning as login.tsx's
      // passkey path, "try again" covers both that and a genuine failure.
      setError(
        caught instanceof ApiError ? caught.message : 'La clé d’accès a été refusée ou annulée.',
      )
    } finally {
      setRegistering(false)
    }
  }

  return (
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Paramètres du compte</h1>
      {email !== null && <p>Connecté en tant que {email}.</p>}

      <section aria-labelledby="settings-passkey-heading">
        <h2 id="settings-passkey-heading">Clés d'accès</h2>
        <p>
          Ajoutez une clé d'accès (Touch ID, Windows Hello, clé de sécurité…) pour vous connecter
          sans mot de passe.
        </p>
        <form onSubmit={submit} aria-labelledby="settings-passkey-heading">
          <label htmlFor="passkey-label">Nom de l'appareil (facultatif)</label>
          <input
            id="passkey-label"
            name="passkey-label"
            placeholder="Ex. : ordinateur portable professionnel"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {error !== null && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
          {success && <p role="status">Clé d'accès ajoutée.</p>}
          <button type="submit" disabled={registering}>
            {registering ? 'Enregistrement…' : 'Ajouter une clé d’accès'}
          </button>
        </form>
      </section>
    </section>
  )
}
