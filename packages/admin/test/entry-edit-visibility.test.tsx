import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, mockEntryVisibility, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The editor's « Visibilité » control (`schema@2.3`, ADR-0037) — WordPress's
 * Public / Private / Password protected, in the same place and with the same
 * three meanings.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  mockEntryVisibility.clear()
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openEntry(): Promise<void> {
  window.history.pushState(null, '', '/collections/article/entry-1')
  render(<App />)
  await screen.findByLabelText('Visibilité')
}

describe('the visibility control', () => {
  it('starts public, and says what each choice means', async () => {
    await openEntry()

    const select = screen.getByLabelText('Visibilité') as HTMLSelectElement
    expect(select.value).toBe('public')
    expect(screen.getByText('Tout le monde peut lire cette page.')).toBeDefined()

    fireEvent.change(select, { target: { value: 'private' } })
    // The sentence that matters most: a private page does not 403, it does
    // not exist.
    expect(screen.getByText(/la page n'existe pas/u)).toBeDefined()
  })

  it('makes an entry private through the real route', async () => {
    await openEntry()

    fireEvent.change(screen.getByLabelText('Visibilité'), { target: { value: 'private' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(mockEntryVisibility.get('entry-1')).toBe('private'))
    expect(await screen.findByText('Visibilité enregistrée.')).toBeDefined()
  })

  it('asks for a password before it will protect a page, and never shows it back', async () => {
    await openEntry()

    fireEvent.change(screen.getByLabelText('Visibilité'), { target: { value: 'password' } })
    // Nothing to apply yet: a protected page with no password is refused by
    // the server, so the button does not offer the trip.
    expect(screen.getByRole('button', { name: 'Appliquer' })).toHaveProperty('disabled', true)

    const field = screen.getByLabelText('Mot de passe de la page') as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.change(field, { target: { value: 'sésame' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(mockEntryVisibility.get('entry-1')).toBe('password'))
    // Emptied on success: nothing reads a password back, so the screen must
    // not pretend it holds one.
    expect((screen.getByLabelText('Mot de passe de la page') as HTMLInputElement).value).toBe('')
  })
})
