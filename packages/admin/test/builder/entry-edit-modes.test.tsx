import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * The builder where an editor meets it: inside the entry editor, next to the
 * form it does not replace (L16).
 *
 * The lot is explicit that the visual builder comes *in addition to* the field
 * form, not instead of it — a media reference, a list of items and a
 * rich-text document have no representation a preview can edit. So the two are
 * one screen with one save, and this file is what proves it is one save.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openFirstArticle(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
  await screen.findByRole('heading', { name: 'Contenus' })
  fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
  await screen.findByText('First article')
  fireEvent.click(screen.getByRole('link', { name: 'First article' }))
  await screen.findByRole('heading', { name: 'Modifier : Article' })
}

describe('choosing between the field form and the visual builder', () => {
  it('offers both, and starts on the form', async () => {
    render(<App />)
    await openFirstArticle()

    const group = screen.getByRole('group', { name: "Mode d'édition" })
    expect(group).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Formulaire' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    // The form's own block editor is what is on screen, not a preview.
    expect(screen.queryByTitle('Aperçu de la page')).toBeNull()
  })

  it('switches to the builder, which previews the real page rather than a form', async () => {
    render(<App />)
    await openFirstArticle()

    fireEvent.click(screen.getByRole('button', { name: 'Composition visuelle' }))

    expect(await screen.findByTitle('Aperçu de la page')).not.toBeNull()
    expect(screen.getByRole('group', { name: "Largeur d'aperçu" })).not.toBeNull()
    // An empty page says so rather than showing an empty list.
    expect(screen.getByText(/Aucun bloc/u)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Héros/u }))
    expect(screen.getByRole('list', { name: 'Blocs de la page' })).not.toBeNull()
  })

  it('leaves the typed fields reachable in builder mode, and the block zone to the builder alone', async () => {
    render(<App />)
    await openFirstArticle()
    fireEvent.click(screen.getByRole('button', { name: 'Composition visuelle' }))
    await screen.findByTitle('Aperçu de la page')

    // `title` is still edited by the form — the builder has no opinion on it.
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )
    // `body` is not shown twice: the form's own blocks editor stands down.
    expect(screen.queryByLabelText('body', { exact: false })).toBeNull()
  })

  it('saves what the builder composed through the entry form’s own save', async () => {
    render(<App />)
    await openFirstArticle()
    fireEvent.click(screen.getByRole('button', { name: 'Composition visuelle' }))
    await screen.findByTitle('Aperçu de la page')

    fireEvent.click(screen.getByRole('button', { name: /^Citation/u }))

    // The block the builder just added is selected, and its own fields are in
    // the detail panel — which is the half a preview cannot do. `quote.text`
    // is required by contract B, and the browser will not submit the entry
    // form until it has a value: the two editors share one form, so they share
    // one validity too.
    fireEvent.change(screen.getByLabelText('text', { exact: false }), {
      target: { value: 'Added and filled in the builder' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // One save, the same one the form has always had — never a second, quieter
    // route from the builder to the database. Found by text rather than by
    // `role="status"`: the builder has a live region of its own for
    // "rendering…", and both are legitimately statuses.
    expect(await screen.findByText('Enregistré.')).not.toBeNull()
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const patch = calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH') as
      | [string, RequestInit]
      | undefined
    const sent = JSON.parse(String(patch?.[1].body)) as {
      blocks: Record<string, { type: string }[]>
    }
    expect(sent.blocks['body']?.map((block) => block.type)).toEqual(['quote'])
  })

  it('remembers which editor was chosen, for the next entry opened', async () => {
    const first = render(<App />)
    await openFirstArticle()
    fireEvent.click(screen.getByRole('button', { name: 'Composition visuelle' }))
    await screen.findByTitle('Aperçu de la page')
    first.unmount()
    // A fresh visit, not a re-render of the same route: `BrowserRouter` reads
    // real history, which jsdom keeps between renders in one file.
    window.history.pushState(null, '', '/')

    render(<App />)
    await openFirstArticle()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Composition visuelle' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    )
  })

  it('says why the builder is unavailable on an entry that was never saved', async () => {
    localStorage.setItem('cogenta.admin.editorMode', 'visual')
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    // No page exists at any URL yet, so there is nothing real to preview — and
    // inventing one is the exact failure this whole lot is built to avoid.
    expect(await screen.findByRole('note')).toHaveProperty(
      'textContent',
      expect.stringContaining('La composition visuelle demande une entrée déjà enregistrée'),
    )
    expect(screen.queryByTitle('Aperçu de la page')).toBeNull()
  })
})
