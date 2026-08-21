import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProviders(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Fournisseurs' }))
  await screen.findByRole('heading', { name: 'Fournisseurs' })
}

describe('providers', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/providers')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('saves a provider, never showing the key back, then can disable and remove it', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()

    expect(await screen.findByText(/Aucun fournisseur configuré/)).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('••••alue')).toBeDefined()
    expect(screen.queryByText(/secret-value/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    expect(await screen.findByText('Désactivé')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(await screen.findByText(/Aucun fournisseur configuré/)).toBeDefined()
  })
})
