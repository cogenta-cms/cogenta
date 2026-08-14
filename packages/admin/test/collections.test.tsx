import { fireEvent, render, screen } from '@testing-library/react'
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
})
