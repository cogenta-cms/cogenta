import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dashboard', () => {
  it('hides site health and recent activity from a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // Site health, recent activity, and now the analytics widget — three
    // admin-only sections share this same restriction message.
    const restricted = await screen.findAllByText('Réservé au rôle « admin ».')
    expect(restricted).toHaveLength(3)
    expect(screen.queryByText(/sqlite/)).toBeNull()
  })

  it('shows real site health and recent activity to an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(await screen.findByText(/sqlite/)).toBeDefined()
    expect(screen.getByText(/local/)).toBeDefined()
    expect(await screen.findByText(/content\.create/)).toBeDefined()
  })

  it('shows the analytics widget with real totals, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: { totalViews: 8, uniqueVisitors: 3 },
    })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'Vues (7 derniers jours)' })
    expect(await screen.findByText(/Vues\s*:\s*8/)).toBeDefined()
    expect(screen.getByText(/Visiteurs uniques\s*:\s*3/)).toBeDefined()
  })

  it('leaves CVE, Core Web Vitals and backups as explicit empty placeholders', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.getByRole('heading', { name: 'CVE ouvertes' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Core Web Vitals' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'État des sauvegardes' })).toBeDefined()
    expect(screen.getAllByText(/Aucune source de données pour l'instant/u)).toHaveLength(3)
  })
})
