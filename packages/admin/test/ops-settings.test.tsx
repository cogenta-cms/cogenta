import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of the config file (audit follow-up to L10 task 6 / L14 task 1).
 * No form anywhere on this screen: that is the point being tested.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(
  roles: readonly string[],
  webhooksStatus?: {
    endpoints: readonly string[]
    signed: boolean
    disabledForMissingSecret: boolean
  },
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(webhooksStatus === undefined ? {} : { webhooksStatus }) })
}

async function goToOpsSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Sécurité & webhooks' }))
  await screen.findByRole('heading', { name: 'Sécurité & webhooks' })
}

describe('the security & webhooks screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows an admin the resolved security configuration, with no editable field', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText('Sécurité HTTP')).toBeDefined()
    expect(
      screen.getByText("Désactivé — aucune origine n'est configurée.", { exact: false }),
    ).toBeDefined()
    // Read-only: no input, no button that submits a change.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /enregistrer|save/i })).toBeNull()
  })

  it('shows configured webhook endpoints and flags a missing signing secret', async () => {
    signedIn(['admin'], {
      endpoints: ['https://receiver.example/webhook'],
      signed: false,
      disabledForMissingSecret: true,
    })
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText('https://receiver.example/webhook')).toBeDefined()
    expect(screen.getByText(/COGENTA_WEBHOOK_SECRET n'est pas défini/)).toBeDefined()
  })

  it('shows no endpoints as a plain statement, not an error', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText("Aucun endpoint de webhook n'est configuré.")).toBeDefined()
  })
})
