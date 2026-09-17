import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, replaceCalls, restoreCalls, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * « Rechercher et remplacer » (L34) — the screen's single rule, asserted: it
 * shows before it writes, and it only ever writes a search someone has seen.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  replaceCalls.splice(0, replaceCalls.length)
  restoreCalls.splice(0, restoreCalls.length)
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'] })
  window.history.pushState(null, '', '/replace')
  render(<App />)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('search and replace', () => {
  it('shows every change in context before offering to write anything', async () => {
    await screen.findByRole('heading', { name: 'Rechercher et remplacer' })
    // Nothing to apply until something has been shown.
    expect(screen.queryByRole('button', { name: 'Remplacer partout' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'Cogenta' } })
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Kogenta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    // The entry is named by its title, not its id, and each change reads as
    // before/after with its place said in words rather than as a data path.
    expect(await screen.findByRole('link', { name: 'Cogenta article' })).toBeDefined()
    expect(screen.getByText('Cogenta article', { selector: 'del' })).toBeDefined()
    expect(screen.getByText('Kogenta article', { selector: 'ins' })).toBeDefined()
    expect(screen.getByText('Bloc 3 · heading')).toBeDefined()
    expect(screen.getByRole('heading', { name: '2 occurrences dans 1 entrée' })).toBeDefined()
    expect(replaceCalls).toEqual([{ find: 'Cogenta', replace: 'Kogenta', apply: false }])
  })

  it('asks before it writes, and writes only on the second click', async () => {
    fireEvent.change(await screen.findByLabelText('Rechercher'), { target: { value: 'Cogenta' } })
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Kogenta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Remplacer partout' }))
    expect(replaceCalls.filter((call) => call.apply)).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remplacement' }))
    await waitFor(() => expect(replaceCalls.filter((call) => call.apply)).toHaveLength(1))
    expect(await screen.findByText(/1 entrée modifiée/u)).toBeDefined()
  })

  it('undoes a whole replacement, entry by entry, through the ordinary restore route', async () => {
    fireEvent.change(await screen.findByLabelText('Rechercher'), { target: { value: 'Cogenta' } })
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Kogenta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remplacer partout' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remplacement' }))

    const undo = await screen.findByRole('button', { name: /Annuler ce remplacement/u })
    fireEvent.click(undo)

    // Each entry goes back to the exact version it stood at before the write,
    // through the same route the History tab uses — never a second write path.
    await waitFor(() =>
      expect(restoreCalls).toEqual([{ collection: 'article', id: 'entry-1', version: 4 }]),
    )
    expect(await screen.findByText(/Remplacement annulé sur 1 entrée/u)).toBeDefined()
  })

  it('throws the preview away the moment the search changes', async () => {
    fireEvent.change(await screen.findByLabelText('Rechercher'), { target: { value: 'Cogenta' } })
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Kogenta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByRole('button', { name: 'Remplacer partout' })

    // A different replacement is a different search: the button that writes
    // must not apply one nobody has looked at.
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Autre' } })

    expect(screen.queryByRole('button', { name: 'Remplacer partout' })).toBeNull()
  })

  it('warns when the replacement contains the phrase, before anything is applied', async () => {
    fireEvent.change(await screen.findByLabelText('Rechercher'), { target: { value: 'Cogenta' } })
    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'Cogenta SA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText(/doublerait le changement/u)).toBeDefined()
  })

  it('says so plainly when nothing matches', async () => {
    fireEvent.change(await screen.findByLabelText('Rechercher'), { target: { value: 'absent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('Aucune occurrence trouvée.')).toBeDefined()
  })
})
