import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    fireEvent.change(screen.getByLabelText('Contenu SKILL.md'), {
      target: {
        value: '---\nname: Style guide\ndescription: House style.\n---\n\nUse British spelling.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Style guide')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText(/Aucune compétence configurée/)).toBeDefined()
  })

  it('uploads and removes a reference file for a skill (fiche 57)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgentSkills()

    fireEvent.click(screen.getByRole('button', { name: 'Créer une compétence' }))
    fireEvent.change(screen.getByLabelText('Contenu SKILL.md'), {
      target: { value: '---\nname: Docs\ndescription: House docs.\n---\n\nBody.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('Docs')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    await screen.findByText('Fichiers de référence')
    // The empty state shows once per standard folder (references/scripts/assets).
    expect(screen.getAllByText("Aucun fichier pour l'instant.")).toHaveLength(3)

    const uploadInputs = screen.getAllByLabelText('Téléverser un fichier')
    const file = new File(['# Style'], 'style.md', { type: 'text/markdown' })
    fireEvent.change(uploadInputs[0] as HTMLInputElement, { target: { files: [file] } })

    expect(await screen.findByText('style.md')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(screen.queryByText('style.md')).toBeNull())
  })
})
