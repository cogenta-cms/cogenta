import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, USER, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App, signed in', () => {
  it('renders the dashboard by default, with the skip link and every nav item', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Aller au contenu principal' }).getAttribute('href'),
    ).toBe('#main-content')

    for (const label of ['Tableau de bord', 'Contenus', 'Médiathèque', "Journal d'audit"]) {
      expect(screen.getByRole('link', { name: label })).toBeDefined()
    }
  })

  it('marks the current section as the active link', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const dashboardLink = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(dashboardLink.getAttribute('aria-current')).toBe('page')

    const mediaLink = screen.getByRole('link', { name: 'Médiathèque' })
    expect(mediaLink.getAttribute('aria-current')).toBeNull()
  })

  it('navigates to another section without a full page reload', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))

    expect(await screen.findByRole('heading', { name: 'Médiathèque' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })

  it('gives the routed content a landmark the skip link can reach', async () => {
    render(<App />)
    const main = await screen.findByRole('main')
    expect(main.id).toBe('main-content')
  })

  it('shows the signed-in user and lets them sign out', async () => {
    render(<App />)
    expect(await screen.findByText(USER.email)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe('App, signed out', () => {
  it('redirects to the login page instead of showing a protected route', async () => {
    localStorage.clear()
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })

  it('discards a token the server no longer recognises', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'a-token-the-server-forgot')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Connexion à Cogenta' })).toBeDefined()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})
