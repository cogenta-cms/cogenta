import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, USER } from './helpers/mock-fetch.js'

const startAuthentication = vi.fn()
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
}))

beforeEach(() => {
  localStorage.clear()
  startAuthentication.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fillAndSubmitPassword(email: string, password: string): Promise<void> {
  await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
}

describe('password login', () => {
  it('reaches the dashboard with the correct password', async () => {
    installMockFetch()
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(localStorage.getItem('cogenta.session.token')).toBeTruthy()
  })

  it('shows a translated error and stays on the form for a wrong password', async () => {
    installMockFetch()
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'wrong')

    // The server's `AUTH_INVALID_CREDENTIALS` message is English-only (a
    // stable API string, not UI copy) — the screen maps it to a real French
    // string rather than leaking it verbatim into an otherwise French UI.
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Adresse e-mail ou mot de passe incorrect.',
    )
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })
})

describe('passkey login', () => {
  it('reaches the dashboard when the browser returns a matching assertion', async () => {
    installMockFetch()
    startAuthentication.mockResolvedValue({ id: 'mock-credential-id' })
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    fireEvent.click(screen.getByRole('button', { name: "Se connecter avec une clé d'accès" }))

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'test-challenge', rpId: 'example.com', allowCredentials: [] },
    })
  })

  it('shows an error and stays on the login page when the browser prompt is cancelled', async () => {
    installMockFetch()
    startAuthentication.mockRejectedValue(new Error('cancelled by user'))
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    fireEvent.click(screen.getByRole('button', { name: "Se connecter avec une clé d'accès" }))

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
  })

  it('reports a passkey the server does not recognise', async () => {
    installMockFetch()
    startAuthentication.mockResolvedValue({ id: 'some-other-credential' })
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    fireEvent.click(screen.getByRole('button', { name: "Se connecter avec une clé d'accès" }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'La clé d’accès a été refusée ou annulée.',
    )
  })
})

describe('MFA-required login', () => {
  it('asks for a TOTP code, then reaches the dashboard with the right one', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Code de vérification' })).toBeDefined()

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })

  it('reports an incorrect TOTP code without dropping back to the password step', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')
    await screen.findByRole('heading', { name: 'Code de vérification' })

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Code incorrect.')
    expect(screen.getByRole('heading', { name: 'Code de vérification' })).toBeDefined()
  })
})

/**
 * Fiche 18 task 1 — the way back in when the authenticator behind the TOTP
 * step is unavailable.
 */
describe('recovery-code login', () => {
  it('reaches the dashboard with a correct recovery code, from the TOTP step', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')
    await screen.findByRole('heading', { name: 'Code de vérification' })

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser un code de récupération' }))
    expect(await screen.findByRole('heading', { name: 'Code de récupération' })).toBeDefined()

    fireEvent.change(screen.getByLabelText('Code'), {
      target: { value: 'AAAAA-AAAAA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })

  it('reports an incorrect recovery code without dropping back to the password step', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')
    await screen.findByRole('heading', { name: 'Code de vérification' })
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser un code de récupération' }))
    await screen.findByRole('heading', { name: 'Code de récupération' })

    fireEvent.change(screen.getByLabelText('Code'), {
      target: { value: 'WRONG-CODE0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "Ce code de récupération n'est pas valide.",
    )
    expect(screen.getByRole('heading', { name: 'Code de récupération' })).toBeDefined()
  })

  it('can switch back to the authenticator-app step', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')
    await screen.findByRole('heading', { name: 'Code de vérification' })
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser un code de récupération' }))
    await screen.findByRole('heading', { name: 'Code de récupération' })

    fireEvent.click(
      screen.getByRole('button', { name: "Utiliser mon application d'authentification" }),
    )
    expect(await screen.findByRole('heading', { name: 'Code de vérification' })).toBeDefined()
  })
})

describe('remember me', () => {
  it('is checked by default, so unchecked behaviour is opt-in', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    expect(screen.getByLabelText('Se souvenir de moi sur cet appareil')).toHaveProperty(
      'checked',
      true,
    )
  })

  it('still reaches the dashboard when unchecked', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    fireEvent.click(screen.getByLabelText('Se souvenir de moi sur cet appareil'))
    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })
})

/**
 * ADR-0021. The login screen used to have a third step: an account whose role
 * required MFA and had none was walked through a TOTP enrolment before it could
 * get anywhere. It does not exist any more, and the acceptance criterion is
 * exactly its absence.
 */
describe('an account with a sensitive role and no second factor', () => {
  it('reaches the dashboard with a password alone, with no enrolment step in the way', async () => {
    installMockFetch({ roles: ['admin'] })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(screen.queryByLabelText('Code')).toBeNull()
  })
})

/**
 * Fiche 35 audit T01 — the login screen used to hard-code Cogenta's own
 * logo (`/_cogenta/logo-cogenta.png`) and the literal `alt="Cogenta"`,
 * defeating white-labelling on the one screen every visitor without a
 * session sees. It now reads `GET /api/settings`'s public `branding` group
 * the same way `app-shell.tsx`'s `renderBrandMark()` does for the signed-in
 * chrome, just from a direct anonymous call rather than
 * `SiteSettingsProvider` (which never mounts for `/login`).
 */
describe('branding on the login screen', () => {
  it('shows the Cogenta mark by default', async () => {
    installMockFetch()
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })

    await waitFor(() => {
      const logo = container.querySelector('img[alt="Cogenta"]')
      expect(logo?.getAttribute('src')).toBe('/_cogenta/logo-cogenta.png')
    })
  })

  it('shows the white-label logo and the site title instead, once branding is off', async () => {
    installMockFetch({
      siteSettings: {
        'branding.showCogentaBranding': false,
        'branding.customLogoMediaId': 'media-1',
        'general.title': 'Acme Press',
      },
    })
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })

    await waitFor(() => {
      const logo = container.querySelector('img[alt="Acme Press"]')
      expect(logo).not.toBeNull()
      expect(logo?.getAttribute('src')).toBe('/_image?id=media-1&w=80')
    })
    expect(container.querySelector('img[alt="Cogenta"]')).toBeNull()
  })
})

describe('session restore', () => {
  it('goes straight to the dashboard with a token the server still honours', async () => {
    installMockFetch()
    localStorage.setItem('cogenta.session.token', 'valid-test-token')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Connexion à Cogenta' })).toBeNull(),
    )
  })
})
