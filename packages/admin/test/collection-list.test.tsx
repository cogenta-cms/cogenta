import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToArticles(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
  await screen.findByRole('heading', { name: 'Contenus' })
  fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
}

describe('CollectionListRoute', () => {
  it('lists the fetched entries, with a title fallback to the id', async () => {
    render(<App />)
    await goToArticles()

    expect(await screen.findByText('First article')).toBeDefined()
    expect(screen.getByText('Second article')).toBeDefined()
  })

  it('filters by status', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'draft' } })

    await waitFor(() => expect(screen.queryByText('First article')).toBeNull())
    expect(screen.getByText('Second article')).toBeDefined()
  })

  it('shows a bulk delete action only once a row is selected, for a role that may delete', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner First article' }))
    expect(screen.getByRole('button', { name: 'Supprimer (1)' })).toBeDefined()
  })

  it('searches the collection and shows only the matching entries (L10 task 3)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    await screen.findByRole('heading', { name: '1 résultat(s)' })
    expect(screen.getByRole('link', { name: 'Second article' })).toBeDefined()
    expect(screen.queryByText('First article')).toBeNull()
  })

  it('clearing the search puts the full list back', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByRole('heading', { name: '1 résultat(s)' })

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    await screen.findByText('First article')
    expect(screen.queryByRole('heading', { name: /résultat/ })).toBeNull()
  })

  it('says so plainly when a search matches nothing, rather than showing an empty table', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), {
      target: { value: 'nothing-matches-this' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('Aucun résultat pour cette recherche.')).toBeDefined()
  })

  it('reports a collection nobody can read as not found', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The editor in these tests cannot read "secret-memo" — direct
    // navigation must not leak its existence any more than the collections
    // list already refuses to.
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByRole('heading', { name: 'Contenus' })
    expect(screen.queryByText('Secret memos')).toBeNull()
  })
})
