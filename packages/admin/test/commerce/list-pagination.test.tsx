import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles: ['viewer'] })
})
afterEach(() => vi.unstubAllGlobals())

function response(
  kind: 'orders' | 'customers',
  prefix: string,
  next: string | null,
  count = 20,
): Response {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    email: `${prefix}-${index}@example.com`,
    name: `${prefix}-${index}`,
    reference: `${prefix}-${index}`,
    status: 'pending',
    totalMinor: 100,
    currency: 'EUR',
    placedAt: '2026-09-01T10:00:00.000Z',
  }))
  return new Response(
    JSON.stringify({ [kind]: rows, page: { limit: 20, hasMore: next !== null, nextCursor: next } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function installList(
  kind: 'orders' | 'customers',
  handle: (url: URL) => Promise<Response> | Response,
): URL[] {
  const fallback = globalThis.fetch
  const calls: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === `/api/commerce/${kind}` && (init?.method ?? 'GET') === 'GET') {
        calls.push(url)
        return Promise.resolve(handle(url))
      }
      return fallback(input, init)
    }),
  )
  return calls
}

async function open(kind: 'orders' | 'customers'): Promise<void> {
  window.history.pushState(null, '', `/commerce/${kind}`)
  render(<App />)
  await screen.findByRole('heading', { name: kind === 'orders' ? 'Commandes' : 'Clients' })
}

function search(): HTMLElement {
  return screen.getByLabelText('Rechercher')
}

describe('commerce lists navigate bounded pages', () => {
  it.each(['orders', 'customers'] as const)(
    'loads the next %s page, returns to the preceding page and resets the cursor on search',
    async (kind) => {
      const calls = installList(kind, (url) =>
        url.searchParams.has('q')
          ? response(kind, 'matched', null, 1)
          : url.searchParams.has('cursor')
            ? response(kind, 'second', null)
            : response(kind, 'first', 'position-two'),
      )
      await open(kind)
      await screen.findByRole('link', { name: 'first-0' })
      expect(calls.at(-1)?.searchParams.get('limit')).toBe('20')
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
      await screen.findByRole('link', { name: 'second-0' })
      expect(calls.at(-1)?.searchParams.get('cursor')).toBe('position-two')
      expect(screen.queryByRole('link', { name: 'first-0' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Page suivante' }).hasAttribute('disabled')).toBe(
        true,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }))
      await screen.findByRole('link', { name: 'first-0' })
      expect(calls.at(-1)?.searchParams.has('cursor')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
      await screen.findByRole('link', { name: 'second-0' })
      fireEvent.change(search(), { target: { value: 'matched' } })
      await screen.findByRole('link', { name: 'matched-0' })
      expect(calls.at(-1)?.searchParams.has('cursor')).toBe(false)
      expect(calls.at(-1)?.searchParams.get('q')).toBe('matched')
      expect(screen.queryByRole('button', { name: 'Page précédente' })).toBeNull()
      if (kind === 'orders')
        expect(screen.getByText(/Total des commandes de cette page/u)).toBeDefined()
    },
  )

  it.each(['orders', 'customers'] as const)(
    'ignores an obsolete %s response even when the transport finishes after cancellation',
    async (kind) => {
      let finishSlow: ((value: Response) => void) | undefined
      const calls = installList(kind, (url) => {
        const q = url.searchParams.get('q')
        if (q === 'slow')
          return new Promise<Response>((resolve) => {
            finishSlow = resolve
          })
        return response(kind, q === 'fast' ? 'fast' : 'first', q === null ? 'next' : null, 1)
      })
      await open(kind)
      await screen.findByRole('link', { name: 'first-0' })
      fireEvent.change(search(), { target: { value: 'slow' } })
      await waitFor(() => expect(calls.at(-1)?.searchParams.get('q')).toBe('slow'))
      fireEvent.change(search(), { target: { value: 'fast' } })
      await screen.findByRole('link', { name: 'fast-0' })
      await act(async () => {
        finishSlow?.(response(kind, 'obsolete', 'wrong-next', 1))
      })
      expect(screen.getByRole('link', { name: 'fast-0' })).toBeDefined()
      expect(screen.queryByRole('link', { name: 'obsolete-0' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull()
    },
  )

  it('resets the order cursor for both status and date filters', async () => {
    const calls = installList('orders', (url) =>
      response('orders', url.searchParams.has('cursor') ? 'second' : 'first', 'next', 1),
    )
    await open('orders')
    await screen.findByRole('link', { name: 'first-0' })
    for (const [label, value, param] of [
      ['Filtrer par statut', 'paid', 'status'],
      ['Du', '2026-09-01', 'from'],
      ['Au', '2026-09-30', 'to'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
      await screen.findByRole('link', { name: 'second-0' })
      fireEvent.change(screen.getByLabelText(label ?? ''), { target: { value } })
      await screen.findByRole('link', { name: 'first-0' })
      expect(calls.at(-1)?.searchParams.has('cursor')).toBe(false)
      expect(calls.at(-1)?.searchParams.get(param ?? '')).toBe(value)
    }
  })
})
