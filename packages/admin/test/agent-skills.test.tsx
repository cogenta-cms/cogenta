import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToAgentSkills(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Compétences' }))
  await screen.findByRole('heading', { name: 'Compétences' })
}

describe('agent skills', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/agent-skills')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('creates, edits and removes a skill', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgentSkills()

    expect(await screen.findByText(/Aucune compétence configurée/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Créer une compétence' }))
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Style guide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Style guide')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText(/Aucune compétence configurée/)).toBeDefined()
  })
})
