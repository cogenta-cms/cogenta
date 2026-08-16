import { fireEvent, render, screen } from '@testing-library/react'
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
    fireEvent.click(screen.getByRole('link', { name: 'Doublons' }))

    expect(screen.queryByRole('heading', { name: 'Détection de doublons' })).toBeNull()
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
    fireEvent.click(screen.getByRole('link', { name: 'Doublons' }))
    await screen.findByRole('heading', { name: 'Détection de doublons' })

    fireEvent.click(await screen.findByRole('button', { name: 'Chercher des doublons' }))

    expect(await screen.findByText('Second article')).toBeDefined()
    expect(screen.getByText('93%')).toBeDefined()
    // Nothing on this screen offers to merge or delete — only a link to go
    // compare the two entries by hand.
    expect(screen.getByRole('link', { name: 'Comparer' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /merge|fusion/iu })).toBeNull()
  })
})
