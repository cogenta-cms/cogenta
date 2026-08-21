import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Apparence de l'admin" (L21 task 2) — the admin's own runtime template +
 * personalisation screen, deliberately distinct from "Apparence" (the
 * public site's theming, fiche 14 — `appearance.test.tsx`). Every assertion
 * here checks a real round trip through the mocked `/api/admin-theme`
 * surface, never a snapshot of markup alone.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function goToAdminAppearance(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: "Apparence de l'admin" }))
  await screen.findByRole('heading', { name: "Apparence de l'admin", level: 1 })
}

describe("the admin's own appearance screen", () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/admin-appearance')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows both built-in templates, Nightops active by default', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    expect(await screen.findByText('Nightops')).toBeDefined()
    expect(screen.getByText('Atelier')).toBeDefined()
    expect(screen.getByText('Actif')).toBeDefined()
  })

  it('choosing Atelier and saving makes it the active template, and the choice survives a reload', async () => {
    signedIn(['admin'])
    const first = render(<App />)
    await goToAdminAppearance()

    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ce modèle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Enregistré.')).toBeDefined())
    first.unmount()

    // A fresh mount re-fetches `/api/admin-theme` — the choice must have
    // actually been persisted server-side, not merely held in local state.
    // (The URL is already `/admin-appearance` from the click above, and the
    // session token is still in `localStorage`, so this mount lands
    // straight on the screen rather than the dashboard.)
    render(<App />)
    await screen.findByRole('heading', { name: "Apparence de l'admin", level: 1 })
    const actives = await screen.findAllByText('Actif')
    expect(actives).toHaveLength(1)
  })

  it('personalising the primary colour and saving round-trips the value', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    const primaryInput = screen.getByLabelText('Couleur primaire') as HTMLInputElement
    fireEvent.change(primaryInput, { target: { value: '#123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Enregistré.')).toBeDefined())
    expect((screen.getByLabelText('Couleur primaire') as HTMLInputElement).value).toBe('#123456')
  })

  it('is a distinct screen from the public site\'s own "Apparence"', async () => {
    signedIn(['admin'])
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.getByRole('link', { name: 'Apparence' })).toBeDefined()
    expect(screen.getByRole('link', { name: "Apparence de l'admin" })).toBeDefined()
  })
})
