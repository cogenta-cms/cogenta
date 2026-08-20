import { fireEvent, render, screen } from '@testing-library/react'
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
  it('does not appear in the nav, and does not render, on a site with no AI provider', async () => {
    signedIn()
    const { unmount } = render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    // Without a provider, `assistantTools` resolves to `[]`, so the "IA"
    // group has no visible item and the whole group — including this
    // entry — is absent (fiche 35), not merely a dead link.
    expect(screen.queryByRole('link', { name: 'Interroger le site' })).toBeNull()
    unmount()

    // And the route itself refuses to render for whoever still has the URL.
    window.history.pushState(null, '', '/assistant-chat')
    render(<App />)
    await screen.findByRole('navigation', { name: 'Navigation principale' })

    expect(screen.queryByRole('heading', { name: 'Interroger le site' })).toBeNull()
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
    fireEvent.click(screen.getByRole('link', { name: 'Interroger le site' }))
    await screen.findByRole('heading', { name: 'Interroger le site' })

    fireEvent.change(screen.getByLabelText('Votre question'), {
      target: { value: 'When did the museum open?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }))

    expect(await screen.findByText('The museum opened in 1904.')).toBeDefined()
    // A real, followable source — not just quoted text.
    expect(screen.getByRole('link', { name: 'First article' })).toBeDefined()
    expect(screen.getByText(/It opened its doors in 1904\./u)).toBeDefined()
  })
})
