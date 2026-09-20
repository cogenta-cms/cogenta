import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The interface language a person chose follows them to another browser.
 *
 * It is stored on the account (fiche 17 task 3, through the Profile screen —
 * the only way to change this language at all) *and* cached in this
 * browser's `localStorage`, which is what `detectLanguage` reads at boot,
 * followed by `navigator.language`. Nothing read the account's own value, so
 * signing in from a second browser ignored the stated preference entirely: a
 * person who had chosen English got French.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'
const LANGUAGE_STORAGE_KEY = 'cogenta.admin.language'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the interface language stored on an account', () => {
  it('applies on a browser that has never seen this person before', async () => {
    installMockFetch({ roles: ['admin'], accountLocale: 'en' })
    render(<App />)

    // The English dashboard, from a `localStorage` this browser never wrote.
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeDefined()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('leaves the language alone when the account states none', async () => {
    installMockFetch({ roles: ['admin'], accountLocale: null })
    render(<App />)

    // French: the default this admin has had since ADR-0019.
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })

  it('ignores a value it cannot render, rather than falling back to nothing', async () => {
    installMockFetch({ roles: ['admin'], accountLocale: 'kl' })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })
})
