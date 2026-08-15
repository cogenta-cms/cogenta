import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Paramètres' }))
  await screen.findByRole('heading', { name: 'Paramètres du compte' })
}

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

describe('account settings — what moved to the profile', () => {
  // L11 task 3 moved passkeys next to TOTP, the password and the sessions.
  // Leaving a dead end here would be worse than the split it replaced.
  it('no longer registers passkeys, and says where that went', async () => {
    render(<App />)
    await goToSettings()

    expect(screen.queryByRole('button', { name: 'Ajouter une clé d’accès' })).toBeNull()
    const pointer = screen.getByRole('link', {
      name: /Mot de passe, vérification en deux étapes et sessions actives/u,
    })
    expect(pointer.getAttribute('href')).toBe('/profile')
  })
})
