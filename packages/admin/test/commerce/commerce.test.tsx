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
  fireEvent.click(await screen.findByRole('link', { name: 'Produits' }))
  await screen.findByRole('heading', { name: 'Produits' })
}

async function goToOrders(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Commandes' }))
  await screen.findByRole('heading', { name: 'Commandes' })
  // The heading renders while the order list is still loading; the table only
  // once it has arrived.
  await within(await screen.findByRole('table')).findByText('ORD-0001')
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
    fireEvent.change(within(createDialog).getByLabelText(/^Identifiant/u), {
      target: { value: 'wool-jumper' },
    })
    fireEvent.submit(createDialog.querySelector('form') as HTMLFormElement)

    // Creating a product opens its variants dialog straight away: a product
    // with no variant cannot be sold, so adding one is always the next step.
    const variantsDialog = await screen.findByRole('dialog', {
      name: 'Variantes de Wool jumper',
    })
    fireEvent.click(within(variantsDialog).getByRole('button', { name: 'Ajouter une variante' }))
    await screen.findByRole('dialog', { name: 'Nouvelle variante' })

    fireEvent.change(within(variantsDialog).getByLabelText(/^SKU/u), {
      target: { value: 'WOOL-JUMPER-M' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText(/^Variante/u), {
      target: { value: 'Medium' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Prix'), {
      target: { value: '45.00' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Devise'), {
      target: { value: 'EUR' },
    })
    fireEvent.change(within(variantsDialog).getByLabelText('Stock'), { target: { value: '12' } })
    fireEvent.submit(variantsDialog.querySelector('form') as HTMLFormElement)

    await waitFor(() => {
      expect(within(variantsDialog).getByText('WOOL-JUMPER-M')).toBeDefined()
    })
    // The price shown is in major units — what a shopper reads — even though
    // the request that created it sent 4500 minor units (proved by the real
    // e2e test in @cogenta/cli's serve-commerce.test.ts).
    expect(within(variantsDialog).getByText(/45,00/u)).toBeDefined()

    const footerButtons = within(variantsDialog).getAllByRole('button', { name: 'Fermer' })
    fireEvent.click(footerButtons[footerButtons.length - 1] as HTMLElement)
    await waitFor(() => {
      expect(within(table()).getByText('Wool jumper')).toBeDefined()
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
    fireEvent.change(within(dialog).getByLabelText(/^Identifiant/u), { target: { value: 'x' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    // The server's English refusal is shown in the admin's language.
    expect(
      await screen.findByText('Vous n’avez pas le droit d’effectuer cette action.'),
    ).toBeDefined()
  })
})

/** The status badge sits next to the order's heading. */
function statusBadge(reference: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: `Commande ${reference}` })
  return heading.parentElement as HTMLElement
}

/** A dialog's footer "close"/confirm buttons share a name with its header "X". */
async function openOrder(): Promise<void> {
  await goToOrders()
  fireEvent.click(await screen.findByRole('link', { name: 'ORD-0001' }))
  await screen.findByRole('heading', { name: 'Commande ORD-0001' })
}

async function recordPayment(): Promise<void> {
  // The action is offered twice (page header and payments card).
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Enregistrer le paiement' }))[0] as HTMLElement,
  )
  const dialog = await screen.findByRole('dialog', { name: 'Enregistrer le paiement' })
  fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
  await screen.findByText('Le paiement a été enregistré : la commande est payée.')
  await waitFor(() => {
    expect(within(statusBadge('ORD-0001')).getByText('Payée')).toBeDefined()
  })
}

describe('the order list and detail', () => {
  it('lists the seeded order and opens its detail with lines, payment and history', async () => {
    render(<App />)
    await goToOrders()

    expect(within(table()).getByText('ORD-0001')).toBeDefined()
    fireEvent.click(await screen.findByRole('link', { name: 'ORD-0001' }))

    // The customer's e-mail is shown more than once (header link, customer card).
    expect(
      (await screen.findAllByText('shopper@example.com', { exact: false })).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/WOOL-JUMPER-M/u)).toBeDefined()
    expect(
      screen.getAllByRole('button', { name: 'Enregistrer le paiement' }).length,
    ).toBeGreaterThan(0)
  })

  it('records the payment received and moves the order along', async () => {
    render(<App />)
    await openOrder()

    await recordPayment()
    // Recording the payment is what makes the order payable-for-shipping: the
    // action to record it is gone and the next step is offered.
    expect(screen.queryByRole('button', { name: 'Enregistrer le paiement' })).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme expédiée' }))
    const confirm = await screen.findByRole('dialog', { name: /^Marquer comme expédiée/u })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Marquer comme expédiée' }))
    await screen.findByText('La commande est marquée comme expédiée.')
    await waitFor(() => {
      expect(within(statusBadge('ORD-0001')).getByText('Expédiée')).toBeDefined()
    })
  })

  it('ships an order with tracking, then refunds it partially with a mandatory reason (fiche 52)', async () => {
    render(<App />)
    await openOrder()
    await recordPayment()

    // Shipment tracking (task 4): the form appears once the order is paid,
    // and submitting it both records the tracking and ships the order.
    await screen.findByRole('heading', { name: 'Suivi de l’expédition' })
    fireEvent.change(screen.getByLabelText('Transporteur'), {
      target: { value: 'DHL' },
    })
    fireEvent.change(screen.getByLabelText('Numéro de suivi'), {
      target: { value: 'DHL123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Expédier avec ce suivi' }))
    await waitFor(() => {
      expect(within(statusBadge('ORD-0001')).getByText('Expédiée')).toBeDefined()
    })

    // Partial refund (task 6): the amount defaults to what remains, and a
    // reason is mandatory — it is refused without one.
    fireEvent.click(await screen.findByRole('button', { name: 'Rembourser' }))
    const refundDialog = await screen.findByRole('dialog', { name: 'Rembourser' })
    fireEvent.click(within(refundDialog).getByRole('button', { name: 'Rembourser' }))
    expect(
      await within(refundDialog).findByText(
        'Indiquez le motif : il est obligatoire pour un remboursement.',
      ),
    ).toBeDefined()

    fireEvent.change(within(refundDialog).getByLabelText('Motif du remboursement'), {
      target: { value: 'Un article manquant dans le colis.' },
    })
    fireEvent.click(within(refundDialog).getByRole('button', { name: 'Rembourser' }))

    await screen.findByText(/ont été remboursés/u)
  })

  // Audit T-COM-03: `listOrders`'s search parameter (`q`) already had a real
  // client function and a real server route (fiche 52 task 7) — this screen
  // never read anything into it, so a search that should have found one
  // order among many always showed every order instead.
  it('filters the order list by a search term, and shows the total for what is shown', async () => {
    const timestamp = '2026-03-01T00:00:00.000Z'
    installMockFetch({
      roles: ['admin'],
      commerceProducts: [
        {
          id: 'product-seed',
          handle: 'wool-jumper',
          title: 'Wool jumper',
          status: 'active',
          contentRef: null,
          imageMediaIds: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      commerceVariants: [
        {
          id: 'variant-seed',
          productId: 'product-seed',
          sku: 'WOOL-JUMPER-M',
          title: 'Medium',
          priceMinor: 4500,
          currency: 'EUR',
          onHand: 10,
          allowBackorder: false,
          weightGrams: 0,
          taxCategory: 'standard',
          position: 0,
          lowStockThreshold: null,
          compareAtPriceMinor: null,
          saleStartsAt: null,
          saleEndsAt: null,
          widthMm: null,
          heightMm: null,
          depthMm: null,
          imageMediaId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    render(<App />)
    await goToOrders()
    expect(within(table()).getByText('ORD-0001')).toBeDefined()
    expect(
      screen.getByText('Total de cette page (hors commandes annulées et remboursées) :', {
        exact: false,
      }),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle commande' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle commande' })
    fireEvent.change(within(dialog).getByLabelText('E-mail du client'), {
      target: { value: 'second-buyer@example.com' },
    })
    // Products are found by typing a name or a SKU, never by an internal id.
    fireEvent.change(within(dialog).getByLabelText('Produit'), {
      target: { value: 'wool' },
    })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Wool jumper/u }))
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    // Creating navigates straight to the new order's own detail screen.
    await screen.findByRole('heading', { name: /^Commande ORD-MANUAL-/u })
    expect(
      screen.getAllByText('second-buyer@example.com', { exact: false }).length,
    ).toBeGreaterThan(0)

    fireEvent.click(await screen.findByRole('link', { name: 'Commandes' }))
    await screen.findByRole('heading', { name: 'Commandes' })
    expect(await within(await screen.findByRole('table')).findByText('ORD-0001')).toBeDefined()
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
