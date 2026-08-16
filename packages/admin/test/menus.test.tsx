import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The menu screen.
 *
 * Write is a fixed `admin`/`editor` rule (unlike a taxonomy, a menu carries
 * no per-site permission configuration), which is what the role test below
 * turns on: a viewer sees the (empty) list but no form and no buttons.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMenus(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Menus' }))
  await screen.findByRole('heading', { name: 'Menus' })
}

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

describe('the menu screen', () => {
  it('creates a menu and an item through the real API, and shows both', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToMenus()

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'main' } })
    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#menu-label' }), {
      target: { value: 'Menu principal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    await screen.findByRole('option', { name: 'Menu principal (fr)' })

    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#item-label' }), {
      target: { value: 'Accueil' },
    })
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/' } })
    fireEvent.click(screen.getByRole('button', { name: "Ajouter l'élément" }))

    expect(await screen.findByRole('cell', { name: 'Accueil' })).toBeDefined()
  })

  it('reorders items with the up/down buttons', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'main' } })
    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#menu-label' }), {
      target: { value: 'Menu principal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await screen.findByRole('option', { name: 'Menu principal (fr)' })

    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#item-label' }), {
      target: { value: 'A' },
    })
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/a' } })
    fireEvent.click(screen.getByRole('button', { name: "Ajouter l'élément" }))
    await screen.findByRole('cell', { name: 'A' })

    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#item-label' }), {
      target: { value: 'B' },
    })
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/b' } })
    fireEvent.click(screen.getByRole('button', { name: "Ajouter l'élément" }))
    await screen.findByRole('cell', { name: 'B' })

    const rows = screen.getAllByRole('row').slice(1) // drop the header row
    expect(within(rows[0] as HTMLElement).getByText('A')).toBeDefined()

    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Monter' }))

    await waitFor(() => {
      const reordered = screen.getAllByRole('row')
      expect(within(reordered[1] as HTMLElement).getByText('B')).toBeDefined()
    })
  })

  it('offers no write controls to a viewer', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToMenus()

    expect(screen.queryByLabelText('Nom')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Créer' })).toBeNull()
    expect(screen.queryByRole('button', { name: "Ajouter l'élément" })).toBeNull()
  })
})
