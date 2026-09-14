import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * `assist.find_duplicates`'s admin screen. This is the one L18 tool that
 * needs no AI provider at all, but the screen still respects the toolset's
 * own `available` switch (see `duplicates.tsx`'s own comment) — so it is
 * tested the same way as every other assistant surface: absent without
 * `available: true` from `GET /api/assistant`.
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

const DUPLICATES_TOOL = {
  tool: 'assist.find_duplicates',
  label: 'Find duplicates',
  description: 'Find near-identical entries.',
  cost: 'low',
  needs: ['siteId', 'collections'],
}

describe('the duplicate-detection screen', () => {
  it('does not render on a site where the assistant toolset is off', async () => {
    signedIn()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Assistant' }))

    // Fiche 30 task 2: with no provider, the whole assistant screen becomes
    // the one explanation page — there are no tabs to click into.
    await screen.findByText("Aucun fournisseur IA n'est configuré")
    expect(screen.queryByRole('heading', { name: 'Détection de doublons' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Doublons' })).toBeNull()
  })

  it('reports a possible duplicate with a similarity score, and merges nothing itself', async () => {
    signedIn({
      assistant: { available: true, tools: [DUPLICATES_TOOL] },
      assistantRun: {
        'assist.find_duplicates': {
          duplicates: [
            {
              collection: 'article',
              entryId: 'entry-2',
              excerpt: 'Second article',
              similarity: 0.93,
            },
          ],
          threshold: 0.9,
          recommendedAction: 'review',
          applied: false,
        },
      },
    })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: 'Assistant' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Doublons' }))
    await screen.findByRole('heading', { name: 'Détection de doublons' })

    // The button renders disabled until the entry list it searches from has
    // loaded; a click before that does nothing at all.
    const search = await screen.findByRole('button', { name: 'Chercher des doublons' })
    await waitFor(() => expect(search).toHaveProperty('disabled', false))
    fireEvent.click(search)

    // Scoped to the results: "Second article" is also an option of the entry
    // picker, which is on screen before any search has run.
    const results = await screen.findByRole('table', { name: 'Doublons possibles' })
    expect(within(results).getByText('Second article')).toBeDefined()
    expect(within(results).getByText('93%')).toBeDefined()
    // Nothing on this screen offers to merge or delete — only a link to go
    // compare the two entries by hand.
    expect(screen.getByRole('link', { name: 'Comparer' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /merge|fusion/iu })).toBeNull()
  })
})
