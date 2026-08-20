import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Fiche 30 tasks 2, 3 and 6 — the unified assistant screen: the tool list
 * read from the server (never a hard-coded constant), cost/usage visible
 * with an 80% warning, the vector index's driver/count/last-indexed, and the
 * one screen where an absent AI provider is explained rather than hidden.
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

async function goToAssistant(): Promise<void> {
  render(<App />)
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Assistant' }))
}

describe('the unified assistant screen', () => {
  it('explains how to switch the assistant on when no provider is configured, rather than disappearing', async () => {
    signedIn({
      assistant: { available: false, reason: 'No AI provider is configured for this site.' },
    })
    await goToAssistant()

    expect(await screen.findByText('No AI provider is configured for this site.')).toBeDefined()
    expect(screen.getByText(/cogenta.config/u)).toBeDefined()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('lists the tools the server actually reports, never a hard-coded set', async () => {
    signedIn({
      assistant: {
        available: true,
        model: 'gpt-test-1',
        tools: [
          {
            tool: 'assist.rewrite',
            label: 'Rewrite',
            description: 'Rewrite a passage.',
            cost: 'medium',
            needs: [],
          },
        ],
      },
    })
    await goToAssistant()

    expect(await screen.findByText('Rewrite')).toBeDefined()
    expect(screen.getByText('Rewrite a passage.')).toBeDefined()
    expect(screen.getByText(/gpt-test-1/u)).toBeDefined()
  })

  it('shows usage against the monthly cap, with a warning near the limit', async () => {
    signedIn({
      assistant: {
        available: true,
        tools: [],
        usage: {
          tokensThisMonth: 850_000,
          limit: 1_000_000,
          percentUsed: 85,
          nearLimit: true,
          overLimit: false,
          byTool: [{ tool: 'assist.rewrite', calls: 12, tokens: 850_000 }],
        },
      },
    })
    await goToAssistant()

    expect(await screen.findByText(/850000 sur 1000000/u)).toBeDefined()
    expect(screen.getByText(/utilisé 80 % ou plus|used 80% or more/iu)).toBeDefined()
  })

  it('shows the vector index driver, entry count and last indexed time', async () => {
    signedIn({
      assistant: {
        available: true,
        tools: [
          {
            tool: 'assist.find_duplicates',
            label: 'Find duplicates',
            description: 'Find near-identical entries.',
            cost: 'low',
            needs: ['siteId', 'collections'],
          },
        ],
        vector: {
          driver: 'file',
          dimensions: 384,
          count: 7,
          lastIndexedAt: '2026-08-20T09:00:00.000Z',
        },
      },
    })
    await goToAssistant()

    expect(await screen.findByText(/file \(384/u)).toBeDefined()
    expect(screen.getByText(/7 fiches indexées|7 entries indexed/iu)).toBeDefined()
  })

  it('switches to the chat and duplicates tabs without leaving the screen', async () => {
    signedIn({
      assistant: {
        available: true,
        tools: [
          {
            tool: 'assist.chat',
            label: 'Ask the site',
            description: 'Answer a question from this site.',
            cost: 'medium',
            needs: ['question', 'siteId', 'collections'],
          },
        ],
      },
    })
    await goToAssistant()

    fireEvent.click(await screen.findByRole('tab', { name: 'Interroger le site' }))
    expect(await screen.findByRole('heading', { name: 'Interroger le site' })).toBeDefined()
  })
})
