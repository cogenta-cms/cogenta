import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/auth/auth-context.js'
import { GlobalSearch } from '../../src/shell/global-search.js'

/**
 * The wiring `AppShell` puts in the topbar (L11 task 4): a debounced search
 * box that fans out to `/api/search`, `/api/media` and `/api/users` in
 * parallel and renders one grouped, keyboard-navigable result list.
 *
 * `/api/search`, `/api/media`'s `q` filter and `/api/users`'s `q` filter each
 * already have their own real-server tests against a real SQLite-backed
 * store (`packages/api/test/rest/*.test.ts`) — this test proves the browser
 * side wires those three routes together correctly, with a scripted `fetch`
 * standing in for the network the same way `version-history.test.tsx` does
 * for its own three HTTP calls.
 */

const ADMIN_TOKEN = 'admin-token'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function stubAuthenticatedFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | null,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/session')) {
        return jsonResponse({
          data: { id: 'user-1', email: 'root@example.com', roles: ['admin'] },
        })
      }
      const found = handler(url, init)
      if (found !== null) return found
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

async function renderSignedIn(): Promise<void> {
  localStorage.setItem('cogenta.session.token', ADMIN_TOKEN)
  render(
    <MemoryRouter>
      <AuthProvider>
        <GlobalSearch />
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByLabelText('Recherche globale')
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('GlobalSearch', () => {
  it('does nothing until the user actually types something', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ data: { id: 'user-1', email: 'root@example.com', roles: ['admin'] } }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await renderSignedIn()

    // The session check fires on mount; nothing else does.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('fans a debounced query out to content, media and accounts, and groups the results', async () => {
    stubAuthenticatedFetch((url) => {
      if (url.includes('/api/search')) {
        return jsonResponse({
          data: [
            {
              id: 'entry-1',
              collection: 'article',
              locale: 'en',
              status: 'published',
              title: 'Harbor lights',
              score: 1,
            },
          ],
          page: { hasMore: false, nextOffset: null },
        })
      }
      if (url.includes('/api/media')) {
        return jsonResponse({
          data: [
            {
              id: 'asset-1',
              kind: 'image',
              filename: 'harbor.png',
              mimeType: 'image/png',
              size: 10,
              width: null,
              height: null,
              alt: 'A harbor',
              decorative: false,
              decorativeJustification: null,
              focal: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              createdBy: 'user-1',
            },
          ],
          page: { hasMore: false, nextCursor: null },
        })
      }
      if (url.includes('/api/users')) {
        return jsonResponse({
          data: [
            {
              id: 'user-2',
              email: 'harbor-team@example.com',
              roles: ['editor'],
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              mfa: { totp: false, passkeys: 0 },
            },
          ],
        })
      }
      return null
    })
    await renderSignedIn()

    fireEvent.change(screen.getByLabelText('Recherche globale'), { target: { value: 'harbor' } })

    // Debounced: nothing is visible until the pause elapses and every call resolves.
    expect(screen.queryByRole('listbox')).toBeNull()

    await screen.findByRole('listbox', {}, { timeout: 2000 })
    expect(screen.getByText('Harbor lights')).toBeDefined()
    expect(screen.getByText('harbor.png')).toBeDefined()
    expect(screen.getByText('harbor-team@example.com')).toBeDefined()
    expect(screen.getByRole('group', { name: 'Contenu' })).toBeDefined()
    expect(screen.getByRole('group', { name: 'Médias' })).toBeDefined()
    expect(screen.getByRole('group', { name: 'Utilisateurs' })).toBeDefined()
  })

  it('closes on Escape', async () => {
    stubAuthenticatedFetch((url) => {
      if (url.includes('/api/search')) {
        return jsonResponse({
          data: [
            {
              id: 'entry-1',
              collection: 'article',
              locale: 'en',
              status: 'published',
              title: 'A page',
              score: 1,
            },
          ],
          page: { hasMore: false, nextOffset: null },
        })
      }
      if (url.includes('/api/media'))
        return jsonResponse({ data: [], page: { hasMore: false, nextCursor: null } })
      if (url.includes('/api/users')) return jsonResponse({ data: [] })
      return null
    })
    await renderSignedIn()

    const input = screen.getByLabelText('Recherche globale')
    fireEvent.change(input, { target: { value: 'page' } })
    await screen.findByRole('listbox', {}, { timeout: 2000 })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on a click outside the search box', async () => {
    stubAuthenticatedFetch((url) => {
      if (url.includes('/api/search')) {
        return jsonResponse({
          data: [
            {
              id: 'entry-1',
              collection: 'article',
              locale: 'en',
              status: 'published',
              title: 'A page',
              score: 1,
            },
          ],
          page: { hasMore: false, nextOffset: null },
        })
      }
      if (url.includes('/api/media'))
        return jsonResponse({ data: [], page: { hasMore: false, nextCursor: null } })
      if (url.includes('/api/users')) return jsonResponse({ data: [] })
      return null
    })
    await renderSignedIn()

    fireEvent.change(screen.getByLabelText('Recherche globale'), { target: { value: 'page' } })
    await screen.findByRole('listbox', {}, { timeout: 2000 })

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
