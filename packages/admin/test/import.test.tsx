import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The admin's WordPress import screen (the counterpart to `cogenta import
 * wordpress` on a terminal). Admin-only, same courtesy-plus-server-check
 * split every other admin-only screen in this app uses.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  localStorage.clear()
})

function signIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function goToImport(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Import' }))
  await screen.findByRole('heading', { name: 'Importer du contenu', level: 1 })
}

describe('the WordPress import screen', () => {
  it('shows nothing to a role below admin', async () => {
    signIn(['editor'])
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/import')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('analyses a WordPress export, previews it, then imports it and shows the real report', async () => {
    signIn(['admin'])

    render(<App />)
    await goToImport()

    // WordPress is the source the screen opens on.
    expect((screen.getByLabelText('Type de fichier') as HTMLSelectElement).value).toBe('wordpress')

    const file = new File(['<rss></rss>'], 'export.xml', { type: 'text/xml' })
    const input = screen.getByLabelText('Fichier à importer') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    // Nothing is written yet: what the file holds and where it will go.
    await screen.findByRole('heading', { name: 'Ce que contient ce fichier' })
    expect(screen.getByText('Où ira chaque élément')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Importer maintenant' }))

    await screen.findByRole('heading', { name: "Résultat de l'import" })
    expect(
      screen.getByText(
        'Importé : 2 articles, 1 pages, 1 catégories, 0 étiquettes, 0 fichiers médias, 1 auteurs, 0 commentaires, 1 redirections.',
      ),
    ).toBeDefined()
    expect(screen.getByText(/Draft nobody finished/)).toBeDefined()
    expect(screen.getByText(/old-logo\.png/)).toBeDefined()
  })
})
