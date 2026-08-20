import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Shipping settings (fiche 34 task 2) — zone/method CRUD plus a simulator
 * that calls the exact `available()` checkout uses, so a carrier method's
 * fallback to the stored rate is shown as a real, live behaviour (fiche 34
 * § pièges: "le repli du transporteur est une fonctionnalité, pas un bug").
 */

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

async function goToShipping(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Livraison' }))
  await screen.findByRole('heading', { name: 'Livraison' })
}

describe('the commerce shipping screen', () => {
  it('creates a method from the admin and deletes it again', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToShipping()

    expect(
      await screen.findByText(
        "Aucune méthode de livraison pour l'instant — rien ne peut être livré tant qu'une méthode n'est pas ajoutée.",
      ),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle méthode' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle méthode de livraison' })
    fireEvent.change(within(dialog).getByLabelText('Libellé'), {
      target: { value: 'Standard' },
    })
    fireEvent.change(within(dialog).getByLabelText('Montant'), { target: { value: '4.90' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la méthode' }))

    await waitFor(() => {
      expect(screen.getByText('Standard')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      expect(
        screen.getByText(
          "Aucune méthode de livraison pour l'instant — rien ne peut être livré tant qu'une méthode n'est pas ajoutée.",
        ),
      ).toBeDefined()
    })
  })

  it('shows the carrier fallback wording on a method that names a carrier, in the list and in the simulator', async () => {
    signedInAs(['admin'], {
      commerceShippingMethods: [
        {
          id: 'ship-colissimo',
          label: 'Colissimo',
          country: null,
          region: null,
          kind: 'flat',
          currency: 'EUR',
          amountMinor: 690,
          perKgMinor: 0,
          freeOverMinor: null,
          carrier: 'colissimo',
          position: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    render(<App />)
    await goToShipping()
    await screen.findByText('Colissimo')

    // This is the one piece of business logic worth a dedicated assertion:
    // the fallback is a documented guarantee, not a decoration, and must be
    // visible wherever a carrier method appears -- the table row here.
    expect(
      screen.getByText("colissimo — retombe sur le tarif stocké si l'API ne répond pas", {
        exact: false,
      }),
    ).toBeDefined()

    fireEvent.change(screen.getByLabelText('Sous-total de commande'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }))

    await waitFor(() => {
      expect(
        screen.getAllByText("colissimo — retombe sur le tarif stocké si l'API ne répond pas", {
          exact: false,
        }).length,
      ).toBeGreaterThanOrEqual(2)
    })
  })

  it('refuses the screen to a non-admin', async () => {
    signedInAs(['editor'])
    window.history.pushState(null, '', '/commerce/shipping')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Seul un administrateur peut configurer la livraison.',
    )
  })

  it('has no serious accessibility violation', async () => {
    signedInAs(['admin'], {
      commerceShippingMethods: [
        {
          id: 'ship-standard',
          label: 'Standard',
          country: null,
          region: null,
          kind: 'flat',
          currency: 'EUR',
          amountMinor: 490,
          perKgMinor: 0,
          freeOverMinor: null,
          carrier: null,
          position: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const { container } = render(<App />)
    await goToShipping()
    await screen.findByText('Standard')

    await expectNoSeriousA11yViolations(container)
  })
})
