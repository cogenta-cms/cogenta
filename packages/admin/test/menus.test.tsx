import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The menu screen.
 *
 * Write is a fixed `admin`/`editor` rule (unlike a taxonomy, a menu carries
 * no per-site permission configuration), which is what the role test below
 * turns on: a viewer sees the (empty) list but no form and no buttons.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMenus(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Menus' }))
  await screen.findByRole('heading', { name: 'Menus' })
}

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

/** The "New menu" form's fields always render first, before the "New item" form's. */
function menuLabelField(): HTMLElement {
  const fields = screen.getAllByLabelText('Libellé')
  const field = fields[0]
  if (field === undefined) throw new Error('No "Libellé" field found.')
  return field
}

function itemLabelField(): HTMLElement {
  const fields = screen.getAllByLabelText('Libellé')
  const field = fields[1]
  if (field === undefined) throw new Error('No second "Libellé" field found.')
  return field
}

async function createMenu(name: string, label: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: name } })
  fireEvent.change(menuLabelField(), { target: { value: label } })
  fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
  await screen.findByRole('option', { name: new RegExp(`^${label} \\(`, 'u') })
}

/** The tree region `MenuTree` renders — scoping queries here avoids matching the "parent" `<select>`'s own options, which repeat every item's label as text. */
function treeRegion(): HTMLElement {
  return screen.getByRole('list', { name: 'Éléments du menu' })
}

async function addUrlItem(label: string, url: string): Promise<void> {
  fireEvent.change(itemLabelField(), { target: { value: label } })
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: "Ajouter l'élément" }))
  // The tree only mounts once there is at least one item — an empty menu
  // shows a plain message instead — so the very first item's own arrival is
  // awaited before its containing list can be queried at all.
  const tree = await screen.findByRole('list', { name: 'Éléments du menu' })
  await within(tree).findByText(label)
}

/** The item's own row — the `<li>` `MenuTree` renders it as, carrying the drag handlers and the action buttons. */
function rowOf(label: string): HTMLElement {
  const element = within(treeRegion()).getByText(label).closest('li')
  if (element === null) throw new Error(`No row found for "${label}".`)
  return element as HTMLElement
}

describe('the menu screen', () => {
  it('creates a menu and an item through the real API, and shows both', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')
    await addUrlItem('Accueil', '/')

    expect(within(treeRegion()).getByText('Accueil')).toBeDefined()
  })

  it('reorders items with the up/down buttons, and it survives a reload (fiche 09, task 2)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')
    await addUrlItem('A', '/a')
    await addUrlItem('B', '/b')

    const tree = screen.getByRole('list', { name: 'Éléments du menu' })
    const itemsBefore = within(tree).getAllByRole('listitem')
    expect(within(itemsBefore[0] as HTMLElement).getByText('A')).toBeDefined()

    fireEvent.click(within(rowOf('B')).getByRole('button', { name: 'Monter' }))

    await waitFor(() => {
      const reordered = within(screen.getByRole('list', { name: 'Éléments du menu' })).getAllByRole(
        'listitem',
      )
      expect(within(reordered[0] as HTMLElement).getByText('B')).toBeDefined()
    })

    // Reselecting the menu re-fetches from the server — the order the
    // single `PATCH /api/menus/{id}/items` call wrote, not just the local
    // optimistic state.
    fireEvent.change(screen.getByLabelText('Menu'), { target: { value: '' } })
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Éléments du menu' })).toBeNull())
    fireEvent.change(screen.getByLabelText('Menu'), {
      target: {
        value: (screen.getByRole('option', { name: /^Menu principal/u }) as HTMLOptionElement)
          .value,
      },
    })

    await waitFor(() => {
      const reloaded = within(screen.getByRole('list', { name: 'Éléments du menu' })).getAllByRole(
        'listitem',
      )
      expect(within(reloaded[0] as HTMLElement).getByText('B')).toBeDefined()
    })
  })

  it('indents and un-indents an item with the keyboard-operable buttons alone (fiche 09, task 2)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')
    await addUrlItem('A', '/a')
    await addUrlItem('B', '/b')

    fireEvent.click(
      within(rowOf('B')).getByRole('button', { name: "Imbriquer sous l'élément au-dessus" }),
    )
    await waitFor(() => {
      const row = rowOf('B')
      expect(row.style.marginLeft).not.toBe('0rem')
    })

    fireEvent.click(within(rowOf('B')).getByRole('button', { name: "Remonter d'un niveau" }))
    await waitFor(() => {
      expect(rowOf('B').style.marginLeft).toBe('0rem')
    })
  })

  it("corrects an item's label without recreating it, keeping its position (fiche 09, task 1)", async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')
    await addUrlItem('Abuot', '/about')

    fireEvent.click(within(rowOf('Abuot')).getByRole('button', { name: "Modifier l'élément" }))
    const modal = await screen.findByRole('dialog')
    const label = within(modal).getByLabelText('Libellé') as HTMLInputElement
    fireEvent.change(label, { target: { value: 'About' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(treeRegion()).getByText('About')).toBeDefined()
    expect(within(treeRegion()).queryByText('Abuot')).toBeNull()
  })

  it('links an entry through the searchable picker and flags an unpublished target (fiche 09, task 4)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')

    fireEvent.change(itemLabelField(), { target: { value: 'Second' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'entry' } })

    // No search text yet: the picker falls back to a plain recent-entries
    // listing (never a hard 100-row cap with no way past it — the gap this
    // task fixes).
    const option = await screen.findByRole('option', { name: /Second article/u })
    fireEvent.click(option)

    fireEvent.click(screen.getByRole('button', { name: "Ajouter l'élément" }))

    const tree = await screen.findByRole('list', { name: 'Éléments du menu' })
    await within(tree).findByText('Second')
    // "Second article" is a draft in the fixture — the row must say so.
    expect(within(rowOf('Second')).getByText('Brouillon')).toBeDefined()
  })

  it('offers no write controls to a viewer', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToMenus()

    expect(screen.queryByLabelText('Nom')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Créer' })).toBeNull()
    expect(screen.queryByRole('button', { name: "Ajouter l'élément" })).toBeNull()
  })

  /**
   * The location control (fiche 21, task 1): a bare text input next to a
   * datalist hint let an editor type a near-miss (`Primary`, `primery`) and
   * never notice the header stayed unassigned. Named choices remove that
   * class of mistake for the theme's two known slots, and it round-trips
   * through the real `PATCH /api/menus/{id}` call, not just local state.
   */
  it('assigns a menu to the header slot through an unambiguous choice, not free text', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')

    fireEvent.change(screen.getByLabelText('Emplacement'), { target: { value: 'primary' } })
    fireEvent.click(screen.getByRole('button', { name: "Enregistrer l'emplacement" }))

    await waitFor(
      () => {
        expect(
          screen.getByRole('option', { name: /^Menu principal \(.+, primary\)$/u }),
        ).toBeDefined()
      },
      { timeout: 5000 },
    )
    // No free-text field is left showing once a named slot is chosen.
    expect(screen.queryByLabelText("Nom de l'emplacement")).toBeNull()
  })

  it("lets a theme-specific slot name through the 'Other' option, and only then shows the free-text field", async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')

    fireEvent.change(screen.getByLabelText('Emplacement'), { target: { value: 'custom' } })
    const customField = await screen.findByLabelText("Nom de l'emplacement")
    fireEvent.change(customField, { target: { value: 'sidebar' } })
    fireEvent.click(screen.getByRole('button', { name: "Enregistrer l'emplacement" }))

    await waitFor(
      () => {
        expect(
          screen.getByRole('option', { name: /^Menu principal \(.+, sidebar\)$/u }),
        ).toBeDefined()
      },
      { timeout: 5000 },
    )
  })

  it('unassigns a menu from its slot by choosing "not assigned"', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToMenus()

    await createMenu('main', 'Menu principal')
    fireEvent.change(screen.getByLabelText('Emplacement'), { target: { value: 'footer' } })
    fireEvent.click(screen.getByRole('button', { name: "Enregistrer l'emplacement" }))
    await waitFor(
      () => {
        expect(
          screen.getByRole('option', { name: /^Menu principal \(.+, footer\)$/u }),
        ).toBeDefined()
      },
      { timeout: 5000 },
    )

    fireEvent.change(screen.getByLabelText('Emplacement'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: "Enregistrer l'emplacement" }))

    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /^Menu principal \([^,]+\)$/u })).toBeDefined()
      },
      { timeout: 5000 },
    )
  })
})
