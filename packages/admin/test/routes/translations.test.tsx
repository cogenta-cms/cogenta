import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * The translation dashboard (fiche 10 task 1): one row per root entry, one
 * column per site locale, task 2's obsolescence signal shown as a fact
 * alongside the state rather than as a verdict.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(overrides: Parameters<typeof installMockFetch>[0] = {}): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'], ...overrides })
}

describe('the translation dashboard', () => {
  it('says there is nothing to compare on a single-locale site', async () => {
    signedIn()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Traductions' }))

    await screen.findByText("Ce site n'a qu'une seule langue ; il n'y a rien à comparer.")
  })

  it('shows one row per root entry, a cell per locale, and the obsolete signal', async () => {
    signedIn({ siteLocales: ['en', 'fr'] })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Traductions' }))
    await screen.findByRole('heading', { name: 'Traductions' })

    // Two roots from the fixture: "First article" has an `fr` translation,
    // "Second article" does not.
    await screen.findByText('First article')
    expect(screen.getByText('Second article')).toBeDefined()

    // The French cell for the translated one: published-state link plus the
    // obsolescence fact, stated rather than judged.
    expect(screen.getByText(/Source modifiée depuis/u)).toBeDefined()

    // The untranslated root offers to create one instead of a state link.
    const createLinks = screen.getAllByRole('link', { name: 'Créer' })
    expect(createLinks.length).toBeGreaterThan(0)
  })

  it('never offers a collection the role cannot read', async () => {
    // The fixture's `secret-memo` is `read: ['admin']` only.
    signedIn({ siteLocales: ['en', 'fr'], roles: ['editor'] })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Traductions' }))
    await screen.findByRole('heading', { name: 'Traductions' })
    await screen.findByText('First article')

    expect(screen.queryByRole('option', { name: 'Secret memos' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Articles' })).toBeDefined()
  })
})
