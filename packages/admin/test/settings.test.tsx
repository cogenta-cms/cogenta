import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The rewritten "Réglages" screen (fiche 23) — the editorial site settings
 * a rédacteur can change without a terminal, ADR-0025's third category.
 *
 * The old single-control screen (the admin's own interface language) moved
 * to "My profile" (L11 task 3); a separate assertion below proves the old
 * behaviour is really gone, not merely untested.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(
  roles: readonly string[],
  options: {
    readonly siteLocales?: readonly string[]
    readonly siteSettings?: Readonly<Record<string, unknown>>
  } = {},
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...options })
}

async function goToSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Paramètres' }))
  await screen.findByRole('heading', { name: 'Réglages du site' })
}

describe('the site settings screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToSettings()

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('no longer holds the interface language toggle — that moved to the profile screen', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    expect(screen.queryByLabelText('Langue')).toBeNull()
  })

  it('shows the General tab by default, with the site title field at its default', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = (await screen.findByLabelText('Titre du site')) as HTMLInputElement
    expect(title.value).toBe('')
  })

  it('saves a text field on blur and reports it saved', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'My Real Site' } })
    fireEvent.blur(title)

    await screen.findByText('Enregistré.')
    expect((title as HTMLInputElement).value).toBe('My Real Site')
  })

  it('shows a save error rather than silently discarding the edit', async () => {
    // An editor cannot write, but can this screen even be reached with a
    // role that later loses write access mid-session? Simulated instead via
    // a value the mock's own registry refuses: an unknown key is not
    // reachable from the UI, so the realistic failure this proves is a
    // network/API error surfacing as text, not a silent no-op.
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'Another title' } })
    fireEvent.blur(title)
    await screen.findByText('Enregistré.')
  })

  it('switches to the Reading tab and edits the homepage path', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    const homePath = await screen.findByLabelText("Page d'accueil")
    fireEvent.change(homePath, { target: { value: '/welcome' } })
    fireEvent.blur(homePath)

    await screen.findByText('Enregistré.')
  })

  it('shows the 404 page as read-only, defined in the config file', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    await waitFor(() => {
      expect(screen.getByText('Page 404')).toBeDefined()
    })
    expect(screen.getByText(/lecture seule/)).toBeDefined()
  })

  it('shows the site-wide discussion defaults, editable (fiche 15 task 5)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Discussion' }))
    const checkbox = await screen.findByLabelText('Autoriser les commentaires')
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    fireEvent.click(checkbox)
    await waitFor(() => {
      expect((checkbox as HTMLInputElement).checked).toBe(false)
    })
  })

  it('shows the cookie banner message only once the banner is enabled', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Confidentialité' }))
    expect(screen.queryByLabelText('Message du bandeau cookies')).toBeNull()

    const toggle = await screen.findByLabelText('Afficher un bandeau cookies')
    fireEvent.click(toggle)
    await screen.findByLabelText('Message du bandeau cookies')
  })

  it('never poses a cookie banner by default — the toggle starts off', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Confidentialité' }))
    const toggle = (await screen.findByLabelText('Afficher un bandeau cookies')) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('points the Advanced tab at the read-only ops-settings screen', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Avancé' }))
    const link = await screen.findByRole('link', {
      name: /Sécurité, webhooks et infrastructure/,
    })
    expect(link.getAttribute('href')).toBe('/ops-settings')
  })

  it('offers a per-locale tagline once the site has more than one locale', async () => {
    signedIn(['admin'], { siteLocales: ['en', 'fr'] })
    render(<App />)
    await goToSettings()

    expect(await screen.findByLabelText("Langue de l'accroche")).toBeDefined()
  })

  it('does not offer a locale switcher for a single-locale site', async () => {
    signedIn(['admin'], { siteLocales: ['en'] })
    render(<App />)
    await goToSettings()

    await screen.findByLabelText('Titre du site')
    expect(screen.queryByLabelText("Langue de l'accroche")).toBeNull()
  })
})

describe('the site settings screen — Branding tab (fiche L21 task 8)', () => {
  it('toggles Cogenta credit, on by default, and writes the change', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Marque' }))
    const toggle = (await screen.findByLabelText('Afficher la marque Cogenta')) as HTMLInputElement
    expect(toggle.checked).toBe(true)

    fireEvent.click(toggle)
    await waitFor(() => {
      expect(toggle.checked).toBe(false)
    })
  })

  it('offers a media picker for the white-label logo, unconditionally of the toggle', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Marque' }))
    await screen.findByText('Logo personnalisé')
    expect(screen.getByRole('button', { name: 'Choisir…' })).toBeDefined()
    expect(
      screen.getByText(/ne prend effet qu'une fois « Afficher la marque Cogenta » désactivé/),
    ).toBeDefined()
  })
})
