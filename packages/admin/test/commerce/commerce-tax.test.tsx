import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Tax settings (fiche 34 task 1) — zone/rate CRUD plus a simulator that
 * calls the exact resolver a real order uses (fiche 34 § pièges: never a
 * second implementation of "which rule wins").
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

async function goToTax(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Taxes' }))
  await screen.findByRole('heading', { name: 'Taxes' })
}

describe('the commerce tax screen', () => {
  it('creates a rule from the admin and deletes it again', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToTax()

    expect(
      await screen.findByText(
        "Aucune règle de taxe pour l'instant — aucune vente n'est taxée tant qu'une règle n'est pas ajoutée.",
      ),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle règle' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle règle de taxe' })
    fireEvent.change(within(dialog).getByLabelText('Nom'), {
      target: { value: 'Standard FR' },
    })
    fireEvent.change(within(dialog).getByLabelText('Taux (%)'), { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la règle' }))

    await waitFor(() => {
      expect(screen.getByText('Standard FR')).toBeDefined()
    })
    expect(screen.getByRole('table')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      expect(
        screen.getByText(
          "Aucune règle de taxe pour l'instant — aucune vente n'est taxée tant qu'une règle n'est pas ajoutée.",
        ),
      ).toBeDefined()
    })
  })

  it('runs the simulator against the exact same resolver checkout uses', async () => {
    signedInAs(['admin'], {
      commerceTaxRules: [
        {
          id: 'tax-book',
          country: 'FR',
          region: null,
          taxCategory: 'super-reduced',
          name: 'Super-reduced (books)',
          rateBp: 550,
          includedInPrice: true,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'tax-standard',
          country: 'FR',
          region: null,
          taxCategory: 'standard',
          name: 'Standard',
          rateBp: 2000,
          includedInPrice: true,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    render(<App />)
    await goToTax()
    await screen.findByText('Super-reduced (books)')

    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'FR' } })
    fireEvent.change(screen.getByLabelText('Catégorie de taxe'), {
      target: { value: 'super-reduced' },
    })
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }))

    // "un livre est à 5,5 % et un ordinateur à 20 %" — the fiche's own
    // acceptance test for this task, reproduced against the real resolver.
    await screen.findByText('5.5%')
    expect(screen.getByText(/la correspondance la plus spécifique/u)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Catégorie de taxe'), { target: { value: 'standard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }))
    await screen.findByText('20%')
  })

  it('refuses the screen to a non-admin', async () => {
    signedInAs(['editor'])
    // The "Taxes" nav link is itself gated to admin and never renders for
    // this role -- go straight to the route, the same way a bookmarked
    // URL would, and assert the screen's own refusal.
    window.history.pushState(null, '', '/commerce/tax')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Seul un administrateur peut configurer les taxes.',
    )
  })

  it('has no serious accessibility violation', async () => {
    signedInAs(['admin'], {
      commerceTaxRules: [
        {
          id: 'tax-book',
          country: 'FR',
          region: null,
          taxCategory: 'super-reduced',
          name: 'Super-reduced (books)',
          rateBp: 550,
          includedInPrice: true,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const { container } = render(<App />)
    await goToTax()
    await screen.findByText('Super-reduced (books)')

    await expectNoSeriousA11yViolations(container)
  })
})
