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

  it('shows the server error and stays on the form for a wrong password', async () => {
    installMockFetch()
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'wrong')

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Incorrect email or password.',
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
      'The passkey response could not be verified.',
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

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Incorrect verification code.',
    )
    expect(screen.getByRole('heading', { name: 'Code de vérification' })).toBeDefined()
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
