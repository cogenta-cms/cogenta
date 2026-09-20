import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { autosaveKey, writeAutosave } from '../src/collections/autosave.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  window.history.pushState(null, '', '/')
  vi.unstubAllGlobals()
})

/** Answers one URL differently, leaving the rest of the mock exactly as it is. */
function failLoadingWith(pattern: RegExp, response: () => Response): void {
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (pattern.test(url)) return response()
    return inner(input, init)
  })
}

/**
 * A stale bookmark, a link in an old email, an entry somebody deleted in
 * another tab. The screen used to render the whole editor anyway — every field
 * editable, "Publier" and "Dupliquer" live — and the 404s only ever reached the
 * browser console, so an editor could write a whole article into a form
 * pointing at nothing and lose it at the first save.
 */
describe('opening an entry that does not exist', () => {
  it('says so, and offers no form to write in', async () => {
    window.history.pushState(null, '', '/collections/article/entry-that-never-existed')
    render(<App />)

    await screen.findByRole('heading', { name: 'Article introuvable' })

    // The point of the fix: nothing on this screen invites writing.
    expect(screen.queryByRole('heading', { name: 'Modifier : Article' })).toBeNull()
    expect(screen.queryByLabelText('Titre', { exact: false })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()

    expect(screen.getByRole('link', { name: 'Retour à la liste' })).toHaveProperty(
      'pathname',
      '/collections/article',
    )
  })

  it('still shows the editor under a banner when the load failed for another reason', async () => {
    // A 500 or a dropped connection is not "it is not there": the entry may
    // well exist, and retrying is the right move — so the editor stays, and
    // only a real CONTENT_NOT_FOUND takes it away.
    failLoadingWith(
      /\/api\/content\/article\/first-article(\?|$)/u,
      () =>
        new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Boom.' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    )
    window.history.pushState(null, '', '/collections/article/first-article')
    render(<App />)

    await screen.findByRole('heading', { name: 'Modifier : Article' })
    expect(screen.queryByRole('heading', { name: 'Article introuvable' })).toBeNull()
  })

  it('does not pretend nothing was lost when this browser still holds a draft', async () => {
    // The one case where "there was nothing here" would be a lie: somebody
    // typed, the tab autosaved, and the entry was deleted elsewhere in
    // between. Saying so is the least we owe them.
    writeAutosave(localStorage, autosaveKey('article', 'entry-deleted-mid-edit', 'en'), {
      values: { title: 'Half a paragraph nobody will see again' },
      blocks: {},
    })
    window.history.pushState(null, '', '/collections/article/entry-deleted-mid-edit?locale=en')
    render(<App />)

    await screen.findByRole('heading', { name: 'Article introuvable' })
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('modifications non enregistrées'),
    )
  })
})
