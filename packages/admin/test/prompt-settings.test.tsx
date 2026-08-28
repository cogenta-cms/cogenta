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

describe('prompt settings — the open row has its own URL (fiche 71)', () => {
  async function createTemplate(): Promise<void> {
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
    await screen.findByText('Rewrite')
  }

  it('writes ?editing=<id> into the URL when opening a template for edit', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToPromptSettings()
    await createTemplate()

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))

    expect(window.location.search).toContain('editing=template-1')
  })

  it('shows the row already open when mounted directly on ?editing=<id>, no click needed', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    const first = render(<App />)
    await goToPromptSettings()
    await createTemplate()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(window.location.search).toContain('editing=template-1')
    first.unmount()

    // A fresh mount straight on the edit URL — the edit row must be open on
    // the very first render, not only after a click.
    render(<App />)
    await screen.findByText('Rewrite')
    expect((await screen.findByLabelText('Nom')) as HTMLInputElement).toHaveProperty(
      'value',
      'Rewrite',
    )
  })

  it('shows a clear message, not a blank row, for an id that no longer exists', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })
    window.history.pushState(null, '', '/prompt-settings?editing=template-does-not-exist')

    render(<App />)
    await screen.findByRole('heading', { name: 'Réglages des prompts' })

    expect(await screen.findByText("Ce modèle de prompt n'existe pas ou plus.")).toBeDefined()
  })
})
