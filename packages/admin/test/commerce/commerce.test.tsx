import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles })
}

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProducts(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Produits' }))
  await screen.findByRole('heading', { name: 'Produits' })
}

async function goToOrders(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Commandes' }))
  await screen.findByRole('heading', { name: 'Commandes' })
}

function table(): HTMLElement {
  return screen.getByRole('table')
}

describe('the product catalogue', () => {
  it('creates a product, then adds several variants to it, each with its own price and stock', async () => {
    render(<App />)
    await goToProducts()

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau produit' }))
    const createDialog = await screen.findByRole('dialog', { name: 'Créer un produit' })

    fireEvent.change(within(createDialog).getByLabelText('Titre'), {
      target: { value: 'Wool jumper' },
    })
    fireEvent.change(within(createDialog).getByLabelText('Identifiant'), {
      target: { value: 'wool-jumper' },
    })
    fireEvent.submit(createDialog.querySelector('form') as HTMLFormElement)

    await waitFor(() => {
      expect(within(table()).getByText('Wool jumper')).toBeDefined()
    })
    expect(within(table()).getByText('0 variante')).toBeDefined()

    fireEvent.click(within(table()).getByRole('button', { name: 'Gérer les variantes' }))
    const variantsDialog = await screen.findByRole('dialog', {
      name: 'Variantes de Wool jumper',
    })

    fireEvent.change(within(variantsDialog).getByLabelText('SKU'), {
      target: { value: 'WOOL-JUMPER-M' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Variante'), {
      target: { value: 'Medium' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Prix'), {
      target: { value: '45.00' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Devise'), {
      target: { value: 'EUR' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Stock'), { target: { value: '12' } })
    fireEvent.submit(
      within(variantsDialog)
        .getByRole('button', { name: 'Ajouter une variante' })
        .closest('form') as HTMLFormElement,
    )

    await waitFor(() => {
      expect(within(variantsDialog).getByText('WOOL-JUMPER-M')).toBeDefined()
    })
    // The price shown is in major units — what a shopper reads — even though
    // the request that created it sent 4500 minor units (proved by the real
    // e2e test in @cogenta/cli's serve-commerce.test.ts).
    expect(within(variantsDialog).getByText(/45,00/u)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(within(table()).getByText('1 variante')).toBeDefined()
    })
    expect(within(table()).getByText('12')).toBeDefined()
  })

  it('refuses an actor without catalog-write, never a UI-only gate', async () => {
    signedInAs(['viewer'])
    // The "Boutique" nav group only shows for an admin or once the shop has
    // sold something (fiche 35); a plain viewer on a fresh fixture sees no
    // link, so go straight to the route, the same way a bookmarked URL
    // would.
    window.history.pushState(null, '', '/commerce/products')
    render(<App />)
    await screen.findByRole('heading', { name: 'Produits' })

    expect(screen.queryByRole('button', { name: 'Nouveau produit' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau produit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un produit' })
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'X' } })
    fireEvent.change(within(dialog).getByLabelText('Identifiant'), { target: { value: 'x' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText(/allowed to do that/u)).toBeDefined()
  })
})

describe('the order list and detail', () => {
  it('lists the seeded order and opens its detail with lines, payment and history', async () => {
    render(<App />)
    await goToOrders()

    expect(within(table()).getByText('ORD-0001')).toBeDefined()
    fireEvent.click(screen.getByRole('link', { name: 'ORD-0001' }))

    await screen.findByText('shopper@example.com', { exact: false })
    expect(screen.getByText('WOOL-JUMPER-M')).toBeDefined()
    expect(screen.getByText(/Marquer reçu/u)).toBeDefined()
  })

  it('marks the payment received and moves the order along', async () => {
    render(<App />)
    await goToOrders()
    fireEvent.click(screen.getByRole('link', { name: 'ORD-0001' }))
    await screen.findByRole('button', { name: 'Marquer reçu' })

    fireEvent.click(screen.getByRole('button', { name: 'Marquer reçu' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Marquer reçu' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Marquer Payée' }))
    await screen.findByText(/Statut modifié/u)
  })

  it('ships an order with tracking, then refunds it partially with a mandatory reason (fiche 52)', async () => {
    render(<App />)
    await goToOrders()
    fireEvent.click(screen.getByRole('link', { name: 'ORD-0001' }))
    await screen.findByRole('button', { name: 'Marquer reçu' })
    fireEvent.click(screen.getByRole('button', { name: 'Marquer reçu' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Marquer reçu' })).toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Marquer Payée' }))
    await screen.findByText('Payée', { exact: false })

    // Shipment tracking (task 4): the form appears once the order is paid,
    // and submitting it both records the tracking and ships the order.
    const trackingForm = (
      await screen.findByRole('heading', { name: 'Suivi de l’expédition' })
    ).closest('section') as HTMLElement
    fireEvent.change(within(trackingForm).getByLabelText('Transporteur'), {
      target: { value: 'DHL' },
    })
    fireEvent.change(within(trackingForm).getByLabelText('Numéro de suivi'), {
      target: { value: 'DHL123456' },
    })
    fireEvent.click(within(trackingForm).getByRole('button', { name: 'Expédier, avec suivi' }))
    await screen.findByText('Expédiée', { exact: false })

    // Partial refund (task 6): the amount defaults to what remains, and a
    // reason is mandatory — the button is only enabled with one filled in.
    fireEvent.click(screen.getByRole('button', { name: 'Rembourser' }))
    const reasonInput = await screen.findByLabelText('Motif (obligatoire)')
    fireEvent.change(reasonInput, { target: { value: 'Un article manquant dans le colis.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }))

    await screen.findByText(/refunded so far|remboursé/u)
  })

  // Audit T-COM-03: `listOrders`'s search parameter (`q`) already had a real
  // client function and a real server route (fiche 52 task 7) — this screen
  // never read anything into it, so a search that should have found one
  // order among many always showed every order instead.
  it('filters the order list by a search term, and shows the total for what is shown', async () => {
    render(<App />)
    await goToOrders()
    expect(within(table()).getByText('ORD-0001')).toBeDefined()
    expect(screen.getByText('Total des commandes affichées :', { exact: false })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle commande' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle commande' })
    fireEvent.change(within(dialog).getByLabelText('E-mail du client'), {
      target: { value: 'second-buyer@example.com' },
    })
    fireEvent.change(within(dialog).getByLabelText('ID de la variante'), {
      target: { value: 'variant-seed' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    // Creating navigates straight to the new order's own detail screen.
    await screen.findByText('second-buyer@example.com', { exact: false }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('link', { name: 'Commandes' }))
    await screen.findByRole('heading', { name: 'Commandes' })
    expect(within(table()).getByText('ORD-0001')).toBeDefined()
    expect(within(table()).getByText(/ORD-MANUAL-/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Rechercher'), {
      target: { value: 'second-buyer' },
    })

    await waitFor(() => {
      expect(within(table()).queryByText('ORD-0001')).toBeNull()
      expect(within(table()).getByText(/ORD-MANUAL-/)).toBeDefined()
    })
  })
})
