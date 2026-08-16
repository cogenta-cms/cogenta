import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The taxonomy screen (`schema@2.0`, ADR-0022).
 *
 * The fixture taxonomy `topic` grants create/update to `editor` and delete to
 * `admin` only, which is what the role tests turn on: an editor may add a
 * term and may not remove one.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToTaxonomies(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Taxonomies' }))
  await screen.findByRole('heading', { name: 'Taxonomies' })
}

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

describe('the taxonomy screen', () => {
  it('lists the declared taxonomies and their terms', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()

    expect(await screen.findByText('Cuisine')).toBeDefined()
    expect(screen.getByRole('combobox', { name: 'Taxonomie' })).toBeDefined()
  })

  it('creates a term through the real API and shows it', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Desserts' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'desserts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le terme' }))

    expect(await screen.findByText('Desserts')).toBeDefined()
  })

  it('reports the server’s refusal rather than guessing, on a duplicate slug', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Autre' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'cuisine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le terme' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('slug')
  })

  it('offers no delete button to an editor, who may not delete terms', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    // The server refuses this actor regardless (R4); the UI does not offer
    // a button whose only outcome would be a 403.
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ajouter le terme' })).toBeDefined()
  })

  it('offers delete to an admin, and removes the term', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText("Aucun terme pour l'instant.")).toBeDefined()
  })

  it('offers no create form to a role that may only read', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToTaxonomies()

    // `read` is open to `public`, so a viewer still sees the tree.
    expect(await screen.findByText('Cuisine')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Ajouter le terme' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
  })
})
