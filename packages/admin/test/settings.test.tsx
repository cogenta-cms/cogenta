import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

const startRegistration = vi.fn()
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: (...args: unknown[]) => startRegistration(...args),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
  startRegistration.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Paramètres' }))
  await screen.findByRole('heading', { name: 'Paramètres du compte' })
}

describe('account settings — passkey registration', () => {
  it('registers a new passkey the server accepts', async () => {
    startRegistration.mockResolvedValue({ id: 'mock-new-credential-id' })
    render(<App />)
    await goToSettings()

    fireEvent.change(screen.getByLabelText("Nom de l'appareil (facultatif)"), {
      target: { value: 'Ordinateur portable' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une clé d’accès' }))

    expect(await screen.findByRole('status')).toHaveProperty('textContent', "Clé d'accès ajoutée.")
    expect(startRegistration).toHaveBeenCalledWith({
      optionsJSON: {
        challenge: 'register-challenge',
        rp: { id: 'example.com', name: 'Cogenta' },
      },
    })
  })

  it('reports a passkey the server refuses, without pretending it worked', async () => {
    startRegistration.mockResolvedValue({ id: 'some-other-credential' })
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une clé d’accès' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'The passkey response could not be verified.',
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('account settings — interface language', () => {
  it('switches the whole interface to English and persists the choice', async () => {
    render(<App />)
    await goToSettings()

    fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } })

    expect(await screen.findByRole('heading', { name: 'Account settings' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeDefined()
    expect(localStorage.getItem('cogenta.admin.language')).toBe('en')
  })
})
