import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToAgents(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Agents' }))
  await screen.findByRole('heading', { name: 'Agents' })
}

describe('agents', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await goToAgents()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lists agents with state, autonomy and budget, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()

    expect(await screen.findByText('security')).toBeDefined()
    expect(screen.getByText('Activé')).toBeDefined()
    expect(screen.getByText('propose')).toBeDefined()
  })

  it('disables an agent from the list', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))

    expect(await screen.findByText('Désactivé')).toBeDefined()
  })

  it('shows traces and history for the selected agent', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('button', { name: 'security' }))

    expect(await screen.findByText(/end_turn/)).toBeDefined()
    expect(await screen.findByText(/deps\.scan/)).toBeDefined()
  })
})
