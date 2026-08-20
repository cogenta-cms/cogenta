import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The preview/apply/undo import screen (fiche 25 tasks 1-4): analyze a
 * source, see what it will do before anything is written, apply it, then
 * undo it.
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
  await screen.findByRole('heading', { name: 'Importer depuis un fichier' })
}

describe('the preview/apply/undo import screen', () => {
  it('previews a file, then applies it, showing what was written before anything is undone', async () => {
    signIn(['admin'])
    render(<App />)
    await goToImport()

    const file = new File(['title\na\nb\nc\n'], 'pages.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [file] } })

    await screen.findByText('3 éléments trouvés.')

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer cet import' }))
    await screen.findByText('3 entrées créées.')

    fireEvent.click(screen.getByRole('button', { name: 'Annuler cet import' }))
    await screen.findByText(/tout ce que cet import a créé a été mis à la corbeille/)
  })

  it('does not show the preview import card to a role below admin', async () => {
    signIn(['editor'])
    // The "Import" nav item is itself role-gated to admin (fiche 35) and
    // never renders for this role — go straight to the route, the same way
    // a bookmarked URL would, and assert the screen's own gate refuses.
    window.history.pushState(null, '', '/import')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Importer depuis un fichier' })).toBeNull()
  })
})
