import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch } from '../helpers/mock-fetch.js'

interface MockNotice {
  id: string
  code: string
  severity: string
  dismissible: boolean
  action?: { code: string; href: string }
}

const MFA_NOTICE: MockNotice = {
  id: 'security.mfa-recommended',
  code: 'security.mfa-recommended',
  severity: 'warning',
  dismissible: true,
  action: { code: 'security.mfa-recommended.action', href: '/settings' },
}

function signedIn(notices: readonly MockNotice[] = []): void {
  installMockFetch({ roles: ['admin'], notices })
  localStorage.setItem('cogenta.session.token', 'valid-test-token')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the admin notice board', () => {
  it('shows a recommendation above the page without standing in front of it', async () => {
    signedIn([MFA_NOTICE])
    render(<App />)

    // The page underneath rendered: the notice informs, it does not block.
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(await screen.findByText('Activez la vérification en deux étapes')).toBeDefined()
  })

  it('offers a way to act on it, pointing where the notice says', async () => {
    signedIn([MFA_NOTICE])
    render(<App />)

    const action = await screen.findByRole('link', { name: 'Configurer maintenant' })
    expect(action.getAttribute('href')).toBe('/settings')
  })

  it('renders nothing at all when there is nothing to recommend', async () => {
    signedIn([])
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(screen.queryByText('Activez la vérification en deux étapes')).toBeNull()
  })

  it('removes a dismissed notice and records the dismissal on the server', async () => {
    signedIn([MFA_NOTICE])
    render(<App />)
    await screen.findByText('Activez la vérification en deux étapes')

    fireEvent.click(screen.getByRole('button', { name: 'Masquer cette recommandation' }))

    await waitFor(() => {
      expect(screen.queryByText('Activez la vérification en deux étapes')).toBeNull()
    })
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const dismissed = calls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/notices/security.mfa-recommended/dismiss'),
    )
    expect(dismissed).toBe(true)
  })

  it('shows no dismiss control for a notice the server marks as not dismissible', async () => {
    signedIn([{ ...MFA_NOTICE, dismissible: false }])
    render(<App />)
    await screen.findByText('Activez la vérification en deux étapes')

    expect(screen.queryByRole('button', { name: 'Masquer cette recommandation' })).toBeNull()
  })

  it('falls back to the raw code rather than swallowing a notice it has no wording for', async () => {
    signedIn([
      {
        id: 'plugin.update-available:acme',
        code: 'plugin.update-available',
        severity: 'info',
        dismissible: true,
      },
    ])
    render(<App />)

    expect(await screen.findAllByText('plugin.update-available')).not.toHaveLength(0)
  })

  it('has no serious accessibility violation with a notice on screen', async () => {
    signedIn([MFA_NOTICE])
    const { container } = render(<App />)
    await screen.findByText('Activez la vérification en deux étapes')

    await expectNoSeriousA11yViolations(container)
  })
})
