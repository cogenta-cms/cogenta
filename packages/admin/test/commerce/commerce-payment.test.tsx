import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Payment settings (fiche 34 task 3) — the one screen in this fiche where a
 * mistake leaks money or a key (fiche 34 § pièges: "un écran de paiement est
 * une fuite de clé en puissance"). This file's central test does not trust
 * the component's own source to prove that: it feeds the mock a driver
 * carrying a raw secret in a field the screen has no reason to read, and
 * asserts the string never reaches the rendered DOM -- proof the screen only
 * ever reads `configured`/`tier`, not a guess from reading the component.
 */

const LEAKED_SECRET = 'fake-test-fixture-not-a-real-stripe-key-0123456789'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(
  roles: readonly string[],
  extra: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, ...extra })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToPayment(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Paiement' }))
  await screen.findByRole('heading', { name: 'Paiement' })
}

describe('the commerce payment screen', () => {
  it('never renders a secret value, even when the backend mistakenly includes one', async () => {
    signedInAs(['admin'], {
      commercePaymentDrivers: [
        {
          name: 'stripe',
          tier: 'optimal',
          settlesOffline: false,
          configured: true,
          selected: true,
          // A field the real router never sends and the screen's type never
          // declares -- exactly the shape a backend regression would take.
          apiKey: LEAKED_SECRET,
          secretKey: LEAKED_SECRET,
        },
        {
          name: 'manual',
          tier: 'degraded',
          settlesOffline: true,
          configured: true,
          selected: false,
        },
      ],
    })
    const { container } = render(<App />)
    await goToPayment()
    await screen.findAllByText('Identifiants configurés sur ce serveur ✓')
    // A driver that needs no key says so, rather than claiming one is present.
    expect(screen.getByText('Aucun identifiant nécessaire')).toBeDefined()

    expect(container.innerHTML).not.toContain(LEAKED_SECRET)
    expect(document.body.textContent ?? '').not.toContain(LEAKED_SECRET)
  })

  it('shows the test-mode banner prominently, and the production banner when it is off', async () => {
    signedInAs(['admin'], { commercePaymentTestMode: true })
    render(<App />)
    await goToPayment()

    const banner = await screen.findByText('Mode test activé')
    expect(banner).toBeDefined()
    expect(screen.getByText(/Aucun argent réel ne circule/u)).toBeDefined()
  })

  it('shows the production banner once test mode is off', async () => {
    signedInAs(['admin'], { commercePaymentTestMode: false })
    render(<App />)
    await goToPayment()

    expect(await screen.findByText('Mode production')).toBeDefined()
    expect(screen.getByText("Cette boutique encaisse de l'argent réel.")).toBeDefined()
  })

  it('runs the test-connection button and surfaces success', async () => {
    signedInAs(['admin'], {
      commercePaymentDrivers: [
        {
          name: 'stripe',
          tier: 'optimal',
          settlesOffline: false,
          configured: true,
          selected: true,
        },
      ],
      commercePaymentTestResults: { stripe: { ok: true, message: null, code: 'ok' } },
    })
    render(<App />)
    await goToPayment()
    await screen.findByText('Identifiants configurés sur ce serveur ✓')

    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    await waitFor(() => {
      expect(screen.getByText(/^Connexion réussie/u)).toBeDefined()
    })
  })

  it('offers no connection test for a driver that needs no credentials', async () => {
    signedInAs(['admin'], {
      commercePaymentDrivers: [
        {
          name: 'manual',
          tier: 'degraded',
          settlesOffline: true,
          configured: true,
          selected: true,
        },
      ],
    })
    render(<App />)
    await goToPayment()
    await screen.findByText('Aucun identifiant nécessaire')

    // Nothing to probe: the customer pays outside the site and the shopkeeper
    // records the payment on the order.
    expect(screen.queryByRole('button', { name: 'Tester la connexion' })).toBeNull()
  })

  it('runs the test-connection button and surfaces the failure in the admin’s language', async () => {
    signedInAs(['admin'], {
      commercePaymentDrivers: [
        {
          name: 'stripe',
          tier: 'optimal',
          settlesOffline: false,
          configured: false,
          selected: undefined,
        },
      ],
      commercePaymentTestResults: {
        stripe: { ok: false, message: 'No API key configured for stripe.', code: 'not_configured' },
      },
    })
    render(<App />)
    await goToPayment()
    await screen.findByText('Aucun identifiant configuré')

    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    // The server's English message is for logs and API clients; the screen
    // shows the translation of the stable outcome code instead.
    await waitFor(() => {
      expect(screen.getByText(/^Aucun identifiant n'est configuré pour ce moyen/u)).toBeDefined()
    })
    expect(screen.queryByText('No API key configured for stripe.')).toBeNull()
  })

  it('lists a third, independently registered provider — the screen is an open-ended roster, not a fixed pair', async () => {
    signedInAs(['admin'], {
      commercePaymentDrivers: [
        {
          name: 'stripe',
          tier: 'optimal',
          settlesOffline: false,
          configured: false,
          selected: undefined,
        },
        {
          name: 'paypal',
          tier: 'optimal',
          settlesOffline: false,
          configured: true,
          selected: true,
        },
        {
          name: 'manual',
          tier: 'degraded',
          settlesOffline: true,
          configured: true,
          selected: undefined,
        },
      ],
    })
    render(<App />)
    await goToPayment()

    expect(await screen.findByRole('heading', { name: /^PayPal/u, level: 3 })).toBeDefined()
    // Three rows — nothing about the markup is specific to a pair of
    // gateways. The two online gateways can be probed; the offline one has no
    // credentials to test.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Tester la connexion' })).toHaveLength(2)
  })

  it('refuses the screen to a non-admin', async () => {
    signedInAs(['editor'])
    window.history.pushState(null, '', '/commerce/payment')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Seul un administrateur peut configurer le paiement.',
    )
  })

  it('has no serious accessibility violation', async () => {
    signedInAs(['admin'])
    const { container } = render(<App />)
    await goToPayment()
    await screen.findByText('Aucun identifiant nécessaire')

    await expectNoSeriousA11yViolations(container)
  })
})
