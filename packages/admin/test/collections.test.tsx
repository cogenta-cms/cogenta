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

describe('CollectionsRoute', () => {
  it('lists only the collections the signed-in editor may read', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByRole('heading', { name: 'Contenus' })

    expect(await screen.findByText('Articles')).toBeDefined()
    expect(screen.queryByText('Secret memos')).toBeNull()
  })

  it("shows a real entry count per collection, reusing task 4's ?counts=1 (fiche 01 task 7)", async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByRole('heading', { name: 'Contenus' })

    // MOCK_ENTRIES holds exactly two `article` entries.
    await waitFor(() => expect(screen.getByText('2')).toBeDefined())
  })

  it('creates a new entry in one click from the collections screen (fiche 01 task 7)', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByRole('heading', { name: 'Contenus' })

    fireEvent.click(await screen.findByRole('link', { name: 'Nouveau' }))
    await screen.findByRole('heading', { name: /Nouveau/ })
  })
})
