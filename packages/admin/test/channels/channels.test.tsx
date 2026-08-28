import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * L22 task 2 — the "Canaux" admin screen: linking a personal Telegram/Slack/
 * Discord account through the exact `/api/notices/channels/*` endpoints
 * fiche 38 already exposed (`mock-fetch.ts`'s `linkedChannels` fixture,
 * shared with any future notices-settings screen — no second linking
 * mechanism here).
 */

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(
  roles: readonly string[],
  options: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, ...options })
}

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToChannels(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Canaux' }))
  await screen.findByRole('heading', { name: 'Canaux' })
}

describe('the Canaux screen', () => {
  it('shows each channel as not linked, and an admin the chat hint', async () => {
    render(<App />)
    await goToChannels()

    expect(screen.getAllByText('Non lié.')).toHaveLength(3)
    expect(screen.getByText(/discuter avec un agent directement depuis le canal/u)).toBeDefined()
  })

  it('an editor sees the same links, but the non-admin hint instead of the chat one', async () => {
    signedInAs(['editor'])
    render(<App />)
    await goToChannels()

    expect(
      screen.getByText(/Discuter avec un agent depuis un canal demande le rôle admin/u),
    ).toBeDefined()
    expect(screen.queryByText(/discuter avec un agent directement depuis le canal/u)).toBeNull()
  })

  it('generates a linking code and shows it once, with instructions', async () => {
    render(<App />)
    await goToChannels()

    // Telegram is the first of the three channels the screen lists.
    const [firstGenerateButton] = screen.getAllByRole('button', {
      name: 'Générer un code de liaison',
    })
    fireEvent.click(firstGenerateButton as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('MOCKCODE1')).toBeDefined()
    })
    expect(
      screen.getByText(/Envoyez ce code en message au bot Cogenta sur Telegram/u),
    ).toBeDefined()
  })

  it('shows an already-linked channel with an unlink action, and unlinking returns it to "not linked"', async () => {
    signedInAs(['admin'], {
      linkedChannels: [
        { channelName: 'slack', channelUserId: 'U123', linkedAt: '2026-03-01T00:00:00.000Z' },
      ],
    })
    render(<App />)
    await goToChannels()

    // Only Slack is linked, so this text and this button are each unique on the screen.
    expect(screen.getByText(/Lié depuis le/u)).toBeDefined()
    expect(screen.getAllByText('Non lié.')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Délier' }))

    await waitFor(() => {
      expect(screen.getAllByText('Non lié.')).toHaveLength(3)
    })
  })

  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToChannels()

    await expectNoSeriousA11yViolations(container)
  })
})

/**
 * Fiche 59 — the "Comment faire ?" step-by-step guide, and the optional
 * per-channel bot name that feeds it.
 */
describe('the channel "how does this work?" guide', () => {
  it('shows the operator step and the generic user steps, with no bot name configured', async () => {
    render(<App />)
    await goToChannels()

    // Telegram is the first card.
    const [telegramHowTo] = screen.getAllByRole('button', { name: 'Comment faire ?' })
    fireEvent.click(telegramHowTo as HTMLElement)

    const dialog = await screen.findByRole('dialog', { name: 'Connecter Telegram' })
    const dialogScope = within(dialog)

    expect(dialogScope.getByText(/démarrez « cogenta channels »/u)).toBeDefined()
    expect(
      dialogScope.getByText('Ouvrez une conversation privée avec le bot de ce site sur Telegram.'),
    ).toBeDefined()
    expect(dialogScope.getByText(/Collez le code tel quel/u)).toBeDefined()
    expect(dialogScope.getByText(/Compte lié/u)).toBeDefined()
  })

  it('names the configured bot in the guide instead of the generic wording', async () => {
    signedInAs(['admin'], { siteSettings: { 'channels.slackBotName': '@cogenta-bot' } })
    render(<App />)
    await goToChannels()

    const [, slackHowTo] = screen.getAllByRole('button', { name: 'Comment faire ?' })
    fireEvent.click(slackHowTo as HTMLElement)

    const dialog = await screen.findByRole('dialog', { name: 'Connecter Slack' })
    expect(
      within(dialog).getByText('Ouvrez une conversation privée avec @cogenta-bot sur Slack.'),
    ).toBeDefined()
  })

  it('lets an admin set the bot name, but never exposes anything token-shaped', async () => {
    render(<App />)
    await goToChannels()

    const nameInput = screen.getByLabelText('Nom du bot Telegram') as HTMLInputElement
    expect(nameInput.disabled).toBe(false)
    fireEvent.change(nameInput, { target: { value: '@my_cogenta_bot' } })
    fireEvent.blur(nameInput)

    await waitFor(() => {
      expect(screen.getByLabelText('Nom du bot Telegram')).toHaveProperty(
        'value',
        '@my_cogenta_bot',
      )
    })

    // Nothing on this screen ever names or shows a bot token/credential.
    expect(screen.queryByText(/BOT_TOKEN/u)).toBeNull()
    expect(screen.queryByLabelText(/token/iu)).toBeNull()
  })

  it('disables the bot name field for a non-admin, who still sees the configured value', async () => {
    signedInAs(['editor'], { siteSettings: { 'channels.discordBotName': 'CogentaBot#1234' } })
    render(<App />)
    await goToChannels()

    const nameInput = screen.getByLabelText('Nom du bot Discord') as HTMLInputElement
    expect(nameInput.disabled).toBe(true)
    expect(nameInput.value).toBe('CogentaBot#1234')
  })
})
