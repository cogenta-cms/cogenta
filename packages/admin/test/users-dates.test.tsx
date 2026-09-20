import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles: ['admin'] })
})

afterEach(() => {
  window.history.pushState(null, '', '/')
  vi.unstubAllGlobals()
})

/**
 * The Settings screen tells an operator the site's time zone "governs
 * scheduled publication and every date shown in this admin". The users table
 * printed `2026-09-19T20:26:39.001Z` — and so did the label a screen reader
 * announces for "revoke this session".
 */
describe('dates in the accounts screen', () => {
  it('never shows a raw ISO timestamp', async () => {
    window.history.pushState(null, '', '/users')
    render(<App />)

    // Wait for the table, not the heading: the heading renders while the
    // accounts are still loading, and asserting then would pass on an empty
    // page — a test about dates that never sees one. (`alice@example.com` is
    // no good either: the signed-in account's address is in the top bar
    // before any row exists.)
    await screen.findByRole('heading', { name: 'Utilisateurs' })
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull())
    const main = document.querySelector('#main-content')
    expect(main).not.toBeNull()
    // There is a date on screen at all — without this the rest asserts
    // nothing on an empty table.
    expect(main?.textContent).toMatch(/\d{4}/u)

    // The shape of an ISO instant, anywhere in the rendered text or in any
    // accessible name.
    const iso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u
    expect(iso.test(main?.textContent ?? '')).toBe(false)
    for (const element of main?.querySelectorAll('[aria-label]') ?? []) {
      expect(iso.test(element.getAttribute('aria-label') ?? ''), element.tagName).toBe(false)
    }
  })
})
