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
  fireEvent.click(screen.getByRole('link', { name: 'Import' }))
  await screen.findByRole('heading', { name: 'Importer depuis WordPress' })
}

describe('the WordPress import screen', () => {
  it('shows nothing to a role below admin', async () => {
    signIn(['editor'])

    render(<App />)
    await goToImport()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('uploads a file and shows the real import report', async () => {
    signIn(['admin'])

    render(<App />)
    await goToImport()

    const file = new File(['<rss></rss>'], 'export.xml', { type: 'text/xml' })
    const input = screen.getByLabelText("Fichier d'export (.xml)") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByRole('heading', { name: "Rapport d'import" })
    expect(
      screen.getByText(
        'Importé : 2 articles, 1 pages, 1 catégories, 0 étiquettes, 0 médias, 1 auteurs, 0 commentaires, 1 redirections.',
      ),
    ).toBeDefined()
    expect(screen.getByText(/Draft nobody finished/)).toBeDefined()
    expect(screen.getByText(/old-logo\.png/)).toBeDefined()
  })
})
