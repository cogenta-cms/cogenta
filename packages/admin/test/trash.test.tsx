import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The trash screen (`schema@2.0`, ADR-0022).
 *
 * `article` grants `delete` to `editor` in the fixture, so an editor sees the
 * trash and a viewer does not — which is the R4 half of these tests: the UI
 * follows the declared permissions, and the server refuses regardless.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToTrash(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Corbeille' }))
  await screen.findByRole('heading', { name: 'Corbeille' })
}

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

describe('the trash screen', () => {
  it('lists what was deleted, with the status it had when it was deleted', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    expect(await screen.findByText('Thrown away')).toBeDefined()
    // Not "draft": deletedAt is orthogonal to status, so a published entry in
    // the trash still reads published — and comes back that way.
    expect(screen.getByText('published')).toBeDefined()
    expect(screen.getByText('2026-03-01T00:00:00.000Z')).toBeDefined()
  })

  it('restores an entry through the real untrash route', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurer' }))

    // The list reloads from the server after the call, and the entry is gone
    // from the trash because the server no longer holds it there.
    expect(await screen.findByText('La corbeille est vide.')).toBeDefined()
  })

  it('asks before purging, and does nothing when the answer is no', async () => {
    signedIn(['editor'])
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    render(<App />)
    await goToTrash()

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer définitivement' }))

    // Refused at the confirmation: nothing was sent, and the entry is still
    // there. This is the one irreversible action in the admin.
    expect(await screen.findByText('Thrown away')).toBeDefined()
  })

  it('purges for good once confirmed', async () => {
    signedIn(['editor'])
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    render(<App />)
    await goToTrash()

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer définitivement' }))
    expect(await screen.findByText('La corbeille est vide.')).toBeDefined()
  })

  it('offers no collection at all to a role that may not delete', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToTrash()

    expect(
      await screen.findByText("Aucune collection que vous puissiez supprimer n'a de corbeille."),
    ).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
