import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * L20 audit, points 11 (Élevé) and 18 (Faible): the "create a product" modal
 * used to empty itself silently on success — no closed modal the admin could
 * see, no confirmation, even though the product really was created — and its
 * "Identifiant" field never pre-filled from "Titre" the way Collections'/
 * Menus' own identifier fields already do.
 */

function signedIn(
  roles: readonly string[],
  extra: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, ...extra })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProducts(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Produits' }))
  await screen.findByRole('heading', { name: 'Produits' })
}

describe('the products screen', () => {
  it('closes the create modal and shows a success confirmation once the product is really created', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToProducts()
    await screen.findByText("Aucun produit pour l'instant.")

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau produit' }))
    await screen.findByRole('heading', { name: 'Créer un produit' })

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Chaise' } })
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'chaise' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le produit' }))

    // The modal actually closes — its heading leaves the document.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Créer un produit' })).toBeNull(),
    )
    // A clear success confirmation appears, naming what was created.
    expect(await screen.findByText('« Chaise » a été créé.')).toBeDefined()
    // And the product really is on the server, not just in local state.
    expect(await screen.findByText('Chaise')).toBeDefined()
  })

  it('pre-fills "Identifiant" from "Titre" while typing, until "Identifiant" is edited directly', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToProducts()
    await screen.findByText("Aucun produit pour l'instant.")

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau produit' }))
    await screen.findByRole('heading', { name: 'Créer un produit' })

    const handleInput = screen.getByLabelText('Identifiant') as HTMLInputElement
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Table Basse' } })
    expect(handleInput.value).toBe('table-basse')

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Table Basse XL' } })
    expect(handleInput.value).toBe('table-basse-xl')

    fireEvent.change(handleInput, { target: { value: 'ma-table' } })
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Autre chose' } })
    expect(handleInput.value).toBe('ma-table')
  })
})
