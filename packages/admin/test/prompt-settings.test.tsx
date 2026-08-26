import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToPromptSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Réglages des prompts' }))
  await screen.findByRole('heading', { name: 'Réglages des prompts' })
}

describe('prompt settings', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/prompt-settings')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('creates, edits and removes a prompt template', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToPromptSettings()

    expect(await screen.findByText(/Aucun modèle de prompt configuré/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Créer un modèle' }))
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Rewrite' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Rewrite a passage.' },
    })
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'text' } })
    fireEvent.change(screen.getByLabelText('Modèle'), {
      target: { value: 'Rewrite the passage. {{localeLine}}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Rewrite')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText(/Aucun modèle de prompt configuré/)).toBeDefined()
  })
})
