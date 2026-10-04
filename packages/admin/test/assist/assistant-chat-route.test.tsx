import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * `assist.chat`'s admin screen — one of the five L18 tools that had no admin
 * surface at all before this. R2 first, same as every other assistant
 * surface: on a site with no AI provider, the screen must not exist.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(overrides: Parameters<typeof installMockFetch>[0] = {}): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'], ...overrides })
}

const CHAT_TOOL = {
  tool: 'assist.chat',
  label: 'Ask the site',
  description: 'Answer a question from this site.',
  cost: 'medium',
  needs: ['question', 'siteId', 'collections'],
}

describe('the "ask the site" chat screen', () => {
  it('does not render, on a site with no AI provider — the whole assistant screen explains why instead', async () => {
    signedIn()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Assistant' }))

    await screen.findByText("Aucun fournisseur IA n'est configuré")
    expect(screen.queryByRole('heading', { name: 'Interroger le site' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Interroger le site' })).toBeNull()
  })

  it('says the tool is off rather than rendering a blank panel when a provider is configured but assist.chat is not', async () => {
    // L20 audit §1 point 4: a provider is configured (so the tab exists to
    // click at all) but the enabled toolset does not include `assist.chat` —
    // this must not read as a broken, empty tab.
    signedIn({
      assistant: {
        available: true,
        tools: [
          {
            tool: 'assist.find_duplicates',
            label: 'Find duplicates',
            description: 'Detect near-duplicate content.',
            cost: 'low',
            needs: ['entryId'],
          },
        ],
      },
    })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Assistant' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Interroger le site' }))

    await screen.findByRole('heading', { name: 'Interroger le site' })
    expect(await screen.findByText(/n'est pas activé sur ce site/)).toBeDefined()
    expect(screen.queryByLabelText('Votre question')).toBeNull()
  })

  it('answers a question with the real citations retrieval found', async () => {
    signedIn({
      assistant: { available: true, tools: [CHAT_TOOL] },
      assistantRun: {
        'assist.chat': {
          answer: 'The museum opened in 1904.',
          sources: [
            {
              collection: 'article',
              entryId: 'entry-1',
              title: 'First article',
              excerpt: 'It opened its doors in 1904.',
            },
          ],
          answeredFromSources: true,
          applied: false,
        },
      },
    })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Assistant' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Interroger le site' }))
    await screen.findByRole('heading', { name: 'Interroger le site' })

    // The panel heading renders before the toolset check that decides
    // whether the question field is offered at all.
    fireEvent.change(await screen.findByLabelText('Votre question'), {
      target: { value: 'When did the museum open?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }))

    expect(await screen.findByText('The museum opened in 1904.')).toBeDefined()
    // A real, followable source — not just quoted text.
    expect(screen.getByRole('link', { name: 'First article' })).toBeDefined()
    expect(screen.getByText(/It opened its doors in 1904\./u)).toBeDefined()
  })
})

describe('the chat exposes and queries its permitted reference scope', () => {
  const vector = {
    driver: 'memory',
    dimensions: 64,
    count: 1,
    lastIndexedAt: null,
    collections: [],
    referenceCollection: '_reference_documents',
  }
  for (const role of ['admin', 'editor']) {
    it(`includes reference documents only for an ${role} when the server advertises them`, async () => {
      signedIn({
        roles: [role],
        assistant: { available: true, tools: [CHAT_TOOL], vector },
        assistantRun: {
          'assist.chat': {
            answer: 'MISTRAL-4827',
            sources: [
              {
                collection: '_reference_documents',
                entryId: 'doc-1',
                title: 'museum.md',
                excerpt: 'MISTRAL-4827',
              },
            ],
            answeredFromSources: true,
            applied: false,
          },
        },
      })
      const fetcher = globalThis.fetch
      const captured: string[][] = []
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/api/assistant/run') && typeof init?.body === 'string') {
          const body = JSON.parse(init.body) as { input: { collections: string[] } }
          captured.push(body.input.collections)
        }
        return fetcher(input, init)
      })
      window.history.pushState(null, '', '/assistant')
      render(<App />)
      fireEvent.click(await screen.findByRole('tab', { name: 'Interroger le site' }))
      fireEvent.change(await screen.findByLabelText('Votre question'), {
        target: { value: 'What is the museum code?' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Demander' }))
      await waitFor(() => expect(captured).toHaveLength(1))
      expect(captured[0]?.includes('_reference_documents')).toBe(role === 'admin')
      if (role === 'admin') {
        expect(
          screen.getByText('Les documents de référence indexés sont aussi recherchés.'),
        ).toBeDefined()
        await screen.findByText('museum.md')
        expect(screen.queryByRole('link', { name: 'museum.md' })).toBeNull()
      } else {
        expect(
          screen.queryByText('Les documents de référence indexés sont aussi recherchés.'),
        ).toBeNull()
      }
    })
  }
})
