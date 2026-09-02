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

async function goToArticles(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Contenus' }))
  await screen.findByRole('heading', { name: 'Contenus' })
  fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
  await screen.findByText('First article')
}

const FRESH_ENTRY_BODY = JSON.stringify({
  data: {
    id: 'entry-1',
    status: 'published',
    version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    locale: 'en',
    translationOf: null,
    deletedAt: null,
    publishedAt: '2026-02-01T00:00:00.000Z',
    values: { title: 'Changed by someone else', summary: 'A summary worth reading' },
    blocks: { body: [] },
  },
})

const STALE_WRITE_ERROR_BODY = JSON.stringify({
  error: {
    code: 'CONTENT_STALE_WRITE',
    message: '"entry-1" was changed by someone else since this write was loaded.',
    hint: 'Reload the entry, compare what changed, and reapply your edit.',
  },
})

/**
 * Fiche 35 audit T03 — `entry-edit.tsx`'s stale-write conflict notice
 * (`staleWriteTitle`/`Reload`/`Keep mine`, wired since fiche 02 task 7) had
 * no test proving the DOM it draws when the server actually refuses a save
 * with `CONTENT_STALE_WRITE`. This intercepts the real `PATCH` this screen
 * sends and answers it the way the real server would (409, then the fresh
 * entry `getEntry` re-fetches to build the diff) — every other request
 * still goes through the real mock router.
 */
describe('the stale-write conflict notice', () => {
  it('shows Reload / Keep mine and Reload adopts the fresh version', async () => {
    render(<App />)
    await goToArticles()
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const realFetch = globalThis.fetch
    let patchCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/api/content/article/entry-1') && init?.method === 'PATCH') {
          patchCount += 1
          if (patchCount === 1) {
            return Promise.resolve(
              new Response(STALE_WRITE_ERROR_BODY, {
                status: 409,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
        }
        if (url.includes('/api/content/article/entry-1') && init?.method === undefined) {
          // The re-fetch `entry-edit.tsx` does on CONTENT_STALE_WRITE to
          // build the diff — a different title than what this screen holds,
          // standing in for "someone else's edit".
          return Promise.resolve(
            new Response(FRESH_ENTRY_BODY, {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        }
        return realFetch(input, init)
      }),
    )

    const title = screen.getByLabelText('title', { exact: false }) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'My own edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText("Quelqu'un d'autre a modifié cette entrée")).toBeDefined()
    // The notice names which field differs (not the value) — `title` is the
    // one this test actually changed both sides of.
    expect(screen.getByText('« title » diffère de votre version')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Recharger sa version' }))

    await waitFor(() => {
      expect(title.value).toBe('Changed by someone else')
    })
    expect(screen.queryByText("Quelqu'un d'autre a modifié cette entrée")).toBeNull()
  })

  it('"Keep mine" retries the save with the fresh version, and it lands', async () => {
    render(<App />)
    await goToArticles()
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const realFetch = globalThis.fetch
    let patchCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/api/content/article/entry-1') && init?.method === 'PATCH') {
          patchCount += 1
          if (patchCount === 1) {
            return Promise.resolve(
              new Response(STALE_WRITE_ERROR_BODY, {
                status: 409,
                headers: { 'content-type': 'application/json' },
              }),
            )
          }
          // The retry ("Keep mine") — let it through to the real mock
          // router, whose own PATCH handler answers 200 with no
          // `expectedUpdatedAt` mismatch this time.
          return realFetch(input, init)
        }
        if (url.includes('/api/content/article/entry-1') && init?.method === undefined) {
          return Promise.resolve(
            new Response(FRESH_ENTRY_BODY, {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        }
        return realFetch(input, init)
      }),
    )

    const title = screen.getByLabelText('title', { exact: false }) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'My own edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText("Quelqu'un d'autre a modifié cette entrée")
    fireEvent.click(
      screen.getByRole('button', { name: 'Garder la mienne et enregistrer quand même' }),
    )

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Enregistré.')
    expect(title.value).toBe('My own edit')
    expect(patchCount).toBe(2)
  })
})
