import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Fiche 51 — the catalogue's search/sort, bulk price/archive, content link,
 * category and CSV import/export, all reached through the real screen
 * (`commerce-products.tsx`) rather than unit-tested in isolation: these are
 * exactly the paths a mocked router alone cannot prove wired together.
 */

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProducts(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Produits' }))
  await screen.findByRole('heading', { name: 'Produits' })
}

// Scoped to the "Liste des produits" region: the CSV panel and the bulk
// price preview each render their own `<table>` too, so a bare
// `getByRole('table')` is ambiguous once either is open.
function table(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Liste des produits' })).getByRole('table')
}

async function createProduct(title: string, handle: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau produit' }))
  const dialog = await screen.findByRole('dialog', { name: 'Créer un produit' })
  fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: title } })
  fireEvent.change(within(dialog).getByLabelText('Identifiant'), { target: { value: handle } })
  fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
  await waitFor(() => expect(within(table()).getByText(title)).toBeDefined())
}

async function addVariant(
  productTitle: string,
  fields: { sku: string; price: string; currency?: string; stock?: string },
): Promise<void> {
  const row = within(table()).getByText(productTitle).closest('tr') as HTMLElement
  fireEvent.click(within(row).getByRole('button', { name: 'Gérer les variantes' }))
  const dialog = await screen.findByRole('dialog', { name: `Variantes de ${productTitle}` })
  fireEvent.change(within(dialog).getByLabelText('SKU'), { target: { value: fields.sku } })
  // Deliberately not `fields.sku` again: the SKU and title columns would
  // then both show the same text, and `getByText` below could not tell them
  // apart.
  fireEvent.change(within(dialog).getByLabelText('Variante'), {
    target: { value: `${fields.sku} variant` },
  })
  fireEvent.change(within(dialog).getByLabelText('Prix'), { target: { value: fields.price } })
  fireEvent.change(within(dialog).getByLabelText('Devise'), {
    target: { value: fields.currency ?? 'EUR' },
  })
  fireEvent.change(within(dialog).getByLabelText('Stock'), {
    target: { value: fields.stock ?? '0' },
  })
  fireEvent.submit(
    within(dialog)
      .getByRole('button', { name: 'Ajouter une variante' })
      .closest('form') as HTMLFormElement,
  )
  await waitFor(() => expect(within(dialog).getByText(fields.sku)).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: `Variantes de ${productTitle}` })).toBeNull(),
  )
}

describe('the catalogue search, sort and pagination', () => {
  beforeEach(() => signedInAs(['admin']))

  it('filters the product list by a search term', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Chaise', 'chaise')
    await createProduct('Table basse', 'table-basse')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'chaise' } })

    await waitFor(() => {
      expect(within(table()).getByText('Chaise')).toBeDefined()
      expect(within(table()).queryByText('Table basse')).toBeNull()
    })
  })

  it('sorts the product list by title', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Zebre', 'zebre')
    await createProduct('Abricot', 'abricot')

    fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'title_asc' } })

    await waitFor(() => {
      const cells = within(table())
        .getAllByRole('row')
        .map((row) => row.textContent ?? '')
        .filter((text) => text.includes('Abricot') || text.includes('Zebre'))
      expect(cells[0]).toContain('Abricot')
      expect(cells[1]).toContain('Zebre')
    })
  })
})

describe('bulk actions on selected products', () => {
  beforeEach(() => signedInAs(['admin']))

  it('previews and applies a percentage price adjustment to every selected variant', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Lampe', 'lampe')
    await addVariant('Lampe', { sku: 'LAMP-1', price: '20.00', stock: '5' })

    const row = within(table()).getByText('Lampe').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('checkbox'))

    fireEvent.click(screen.getByRole('button', { name: 'Ajuster les prix' }))
    const bulkDialog = await screen.findByRole('dialog', {
      name: 'Ajuster les prix de la sélection',
    })
    fireEvent.change(within(bulkDialog).getByLabelText('Variation en %'), {
      target: { value: '-10' },
    })

    await waitFor(() => {
      expect(within(bulkDialog).getByText(/20,00/u)).toBeDefined()
      expect(within(bulkDialog).getByText(/18,00/u)).toBeDefined()
    })

    fireEvent.click(within(bulkDialog).getByRole('button', { name: 'Appliquer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ajuster les prix de la sélection' })).toBeNull()
    })

    // Reopen the variant to see the price the bulk action really wrote.
    fireEvent.click(
      within(within(table()).getByText('Lampe').closest('tr') as HTMLElement).getByRole('button', {
        name: 'Gérer les variantes',
      }),
    )
    const variantsDialog = await screen.findByRole('dialog', { name: 'Variantes de Lampe' })
    expect(within(variantsDialog).getByText(/18,00/u)).toBeDefined()
  })

  it('archives every selected product only after an explicit confirmation', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Coussin', 'coussin')
    await createProduct('Plaid', 'plaid')

    for (const title of ['Coussin', 'Plaid']) {
      const row = within(table()).getByText(title).closest('tr') as HTMLElement
      fireEvent.click(within(row).getByRole('checkbox'))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Archiver la sélection' }))
    const confirmDialog = await screen.findByRole('dialog', { name: 'Archiver la sélection' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: "Confirmer l'archivage" }))

    await waitFor(() => {
      const coussinRow = within(table()).getByText('Coussin').closest('tr') as HTMLElement
      const plaidRow = within(table()).getByText('Plaid').closest('tr') as HTMLElement
      expect(within(coussinRow).getByText('Archivé')).toBeDefined()
      expect(within(plaidRow).getByText('Archivé')).toBeDefined()
    })
  })
})

describe('a product’s editorial content link and category', () => {
  beforeEach(() => signedInAs(['admin']))

  it('shows unlinked, creates a linked entry, then unlinks it again', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Veste', 'veste')

    const row = within(table()).getByText('Veste').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Modifier Veste' }))
    const editDialog = await screen.findByRole('dialog', { name: 'Modifier Veste' })

    expect(within(editDialog).getByText('Aucun contenu lié.')).toBeDefined()

    fireEvent.change(within(editDialog).getByLabelText('Collection'), {
      target: { value: 'article' },
    })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Créer une fiche liée' }))

    await waitFor(() => {
      expect(within(editDialog).getByRole('button', { name: 'Dissocier' })).toBeDefined()
    })

    fireEvent.click(within(editDialog).getByRole('button', { name: 'Dissocier' }))
    await waitFor(() => {
      expect(within(editDialog).getByText('Aucun contenu lié.')).toBeDefined()
    })
  })

  it('classifies a product against the taxonomy the site declares', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Bougie', 'bougie')

    const row = within(table()).getByText('Bougie').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Modifier Bougie' }))
    const editDialog = await screen.findByRole('dialog', { name: 'Modifier Bougie' })

    const termSelect = await within(editDialog).findByLabelText('Termes')
    fireEvent.change(termSelect, { target: { value: 'term-existing' } })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Enregistrer la catégorie' }))

    await waitFor(() => {
      expect(within(editDialog).getByText('Catégorie enregistrée.')).toBeDefined()
    })
  })
})

describe('a product’s own images and a variant’s own photo', () => {
  beforeEach(() => signedInAs(['admin']))

  it('adds a product image from the media picker and shows it as the list thumbnail', async () => {
    localStorage.clear()
    localStorage.setItem('cogenta.session.token', VALID_TOKEN)
    installMockFetch({ roles: ['admin'], mediaSeedCount: 1 })

    render(<App />)
    await goToProducts()
    await createProduct('Écharpe', 'echarpe')

    const row = within(table()).getByText('Écharpe').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Modifier Écharpe' }))
    const editDialog = await screen.findByRole('dialog', { name: 'Modifier Écharpe' })

    fireEvent.click(within(editDialog).getByRole('button', { name: 'Ajouter des médias…' }))
    const browseDialog = await screen.findByRole('dialog', { name: 'Choisir un média' })
    fireEvent.click(await within(browseDialog).findByRole('button', { name: /seed-1\.png/u }))

    // The picker itself now shows the picked asset...
    await waitFor(() => {
      expect(within(editDialog).getByText('seed-1.png')).toBeDefined()
    })
    // The browse dialog (`many: true`) stays open after a pick — a gallery
    // keeps browsing to add more — so it must be closed explicitly before the
    // outer edit dialog (made `aria-hidden` while a nested Radix dialog is
    // open) is reachable again.
    fireEvent.click(within(browseDialog).getByRole('button', { name: 'Annuler' }))
    // ...and the save round-tripped: closing and reopening the edit dialog
    // still shows it, proving it was persisted, not just held in local state.
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Modifier Écharpe' }))
    const reopened = await screen.findByRole('dialog', { name: 'Modifier Écharpe' })
    expect(within(reopened).getByText('seed-1.png')).toBeDefined()
  })

  it('sets a variant’s own photo, independently of the rest of the variant edit form', async () => {
    localStorage.clear()
    localStorage.setItem('cogenta.session.token', VALID_TOKEN)
    installMockFetch({ roles: ['admin'], mediaSeedCount: 1 })

    render(<App />)
    await goToProducts()
    await createProduct('Bonnet', 'bonnet')
    await addVariant('Bonnet', { sku: 'BONNET-1', price: '19.90' })

    const row = within(table()).getByText('Bonnet').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Gérer les variantes' }))
    const variantsDialog = await screen.findByRole('dialog', { name: 'Variantes de Bonnet' })
    fireEvent.click(
      within(variantsDialog).getByRole('button', { name: 'Modifier BONNET-1 variant' }),
    )

    fireEvent.click(within(variantsDialog).getByRole('button', { name: 'Choisir…' }))
    const browseDialog = await screen.findByRole('dialog', { name: 'Choisir un média' })
    fireEvent.click(await within(browseDialog).findByRole('button', { name: /seed-1\.png/u }))

    await waitFor(() => {
      expect(within(variantsDialog).getByText('seed-1.png')).toBeDefined()
    })
  })
})

describe('the low-stock alert', () => {
  beforeEach(() => signedInAs(['admin']))

  it('lists a variant whose stock has reached its own threshold', async () => {
    render(<App />)
    await goToProducts()
    await createProduct('Bougie parfumée', 'bougie-parfumee')
    await addVariant('Bougie parfumée', { sku: 'CANDLE-1', price: '9.00', stock: '2' })

    // Set a threshold at or above the current stock — the row-level edit
    // form, opened straight from "Gérer les variantes".
    const productRow = within(table()).getByText('Bougie parfumée').closest('tr') as HTMLElement
    fireEvent.click(within(productRow).getByRole('button', { name: 'Gérer les variantes' }))
    const variantsDialog = await screen.findByRole('dialog', {
      name: 'Variantes de Bougie parfumée',
    })
    fireEvent.click(
      within(variantsDialog).getByRole('button', { name: 'Modifier CANDLE-1 variant' }),
    )
    // Scoped to the row's own edit form: the still-visible "add a variant"
    // form at the bottom of this same dialog carries the same-labelled
    // field, and a bare `within(variantsDialog)` cannot tell the two apart.
    const editForm = within(variantsDialog)
      .getByRole('button', { name: 'Enregistrer' })
      .closest('form') as HTMLFormElement
    fireEvent.change(within(editForm).getByLabelText("Seuil d'alerte"), {
      target: { value: '5' },
    })
    fireEvent.submit(editForm)
    await waitFor(() => expect(within(variantsDialog).getByText('Stock bas')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(screen.getByLabelText('Stock bas uniquement'))
    await waitFor(() => {
      expect(screen.getByText('Bougie parfumée')).toBeDefined()
      expect(screen.getByText('CANDLE-1')).toBeDefined()
    })
  })
})

describe('CSV import and export', () => {
  beforeEach(() => signedInAs(['admin']))

  it('previews an import, showing what will be created, before writing anything', async () => {
    render(<App />)
    await goToProducts()

    fireEvent.click(screen.getByRole('button', { name: 'Import / export CSV' }))
    const csvField = await screen.findByLabelText('Coller un CSV, ou choisir un fichier')
    fireEvent.change(csvField, {
      target: {
        value:
          'handle,title,status,sku,variant,price,currency,onhand,allowbackorder,weightgrams,taxcategory,lowstockthreshold,compareprice,salestartsat,saleendsat,widthmm,heightmm,depthmm\n' +
          'panier,Panier,active,PANIER-1,Panier,25.00,EUR,4,false,0,standard,,,,,,,',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }))

    await waitFor(() => {
      expect(screen.getByText('Sera créé')).toBeDefined()
    })
    // Nothing was written by the preview alone.
    expect(within(table()).queryByText('Panier')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: "Appliquer l'import" }))
    await waitFor(() => {
      expect(screen.getByText(/1 créé/u)).toBeDefined()
    })
  })
})
