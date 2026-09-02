import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '../src/api/agents-client.js'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signIn(): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['admin'] })
}

async function openWidget(): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la discussion avec un agent' }))
  return screen.findByRole('dialog', { name: 'Discuter avec un agent' })
}

/**
 * The bug this closes was reported live: a conversation started somewhere,
 * then opening the floating widget again — even with the right agent
 * selected — did not "load" it. The real fix is server-side persistence
 * (`packages/cli/test/serve-agents.test.ts` proves that end to end against
 * a real HTTP server); these tests prove the widget itself actually reads
 * and writes through it rather than keeping its own local transcript.
 */
describe('the floating agent chat widget', () => {
  it('sends a message and shows the reply', async () => {
    signIn()
    render(<App />)
    const dialog = await openWidget()

    const input = within(dialog).getByLabelText('Message')
    fireEvent.change(input, { target: { value: 'Bonjour' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer' }))

    expect(await within(dialog).findByText('Bonjour')).toBeDefined()
    expect(await within(dialog).findByText('Mock reply to: Bonjour')).toBeDefined()
  })

  it('reloads the real thread from the server on reopen, not a stale local copy', async () => {
    signIn()
    render(<App />)
    const first = await openWidget()

    fireEvent.change(within(first).getByLabelText('Message'), {
      target: { value: 'First message' },
    })
    fireEvent.click(within(first).getByRole('button', { name: 'Envoyer' }))
    await within(first).findByText('Mock reply to: First message')

    // Close, then reopen — a fresh mount of the panel, same as the user's
    // report ("j'ai bien choisi l'agent mais ça ne charge pas la
    // conversation"). It must show what the server actually has, not an
    // empty panel and not a stale client-only copy.
    fireEvent.click(within(first).getByRole('button', { name: 'Fermer' }))
    const reopened = await openWidget()

    expect(await within(reopened).findByText('First message')).toBeDefined()
    expect(await within(reopened).findByText('Mock reply to: First message')).toBeDefined()
  })

  it('loads a different thread when a different agent is selected', async () => {
    signIn()
    // A second agent, created the same way the "Nouvel agent" form does —
    // the default fixture ships only "security", and this test needs two
    // distinct threads to prove they do not leak into each other.
    await createAgent(VALID_TOKEN, {
      name: 'watcher',
      identity: { role: 'Watches things.', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: [],
    })

    render(<App />)
    const dialog = await openWidget()

    const picker = within(dialog).getByLabelText('Agent')
    expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1)

    fireEvent.change(within(dialog).getByLabelText('Message'), {
      target: { value: 'For security' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer' }))
    await within(dialog).findByText('Mock reply to: For security')

    fireEvent.change(picker, { target: { value: 'watcher' } })
    expect((picker as HTMLSelectElement).value).toBe('watcher')

    // A fresh agent's thread starts empty — the prior agent's messages do
    // not leak across, and nothing from this agent's own history was
    // fabricated client-side.
    await within(dialog).findByText(
      (_, element) => element?.tagName === 'P' && (element.textContent ?? '').startsWith('Posez'),
    )
    expect(within(dialog).queryByText('For security')).toBeNull()
  })

  it('does not render for a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(screen.queryByRole('button', { name: 'Ouvrir la discussion avec un agent' })).toBeNull()
  })
})
