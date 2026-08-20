import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The taxonomy screen (`schema@2.0`, ADR-0022; rewritten for
 * `08-taxonomies.md`).
 *
 * The fixture taxonomy `topic` grants create/update to `editor` and delete to
 * `admin` only, which is what the role tests turn on: an editor may add and
 * rename a term and may not remove one.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

const CUISINE = {
  id: 'term-existing',
  taxonomy: 'topic',
  parent: null,
  slug: 'cuisine',
  labels: { fr: 'Cuisine', en: 'Cooking' },
  position: 0,
  depth: 0,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

const DESSERTS = {
  id: 'term-desserts',
  taxonomy: 'topic',
  parent: 'term-existing',
  slug: 'desserts',
  labels: { fr: 'Desserts' },
  position: 0,
  depth: 1,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

const ENTREES = {
  id: 'term-entrees',
  taxonomy: 'topic',
  parent: 'term-existing',
  slug: 'entrees',
  labels: { fr: 'Entrées' },
  position: 1,
  depth: 1,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToTaxonomies(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  // The "Taxonomies" nav link only renders once the schema has loaded far
  // enough to know a taxonomy is declared — wait for it rather than assuming
  // it's already there right after the dashboard heading.
  fireEvent.click(await screen.findByRole('link', { name: 'Taxonomies' }))
  await screen.findByRole('heading', { name: 'Taxonomies' })
}

function signedIn(
  roles: readonly string[],
  extra: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...extra })
}

describe('the taxonomy screen', () => {
  it('lists the declared taxonomies and their terms', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()

    expect(await screen.findByText('Cuisine')).toBeDefined()
    expect(screen.getByRole('combobox', { name: 'Taxonomie' })).toBeDefined()
  })

  it('creates a term through the real API, with a label in every site locale', async () => {
    signedIn(['editor'], { siteLocales: ['fr', 'en'] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau terme' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Libellé (fr)'), {
      target: { value: 'Desserts' },
    })
    fireEvent.change(within(dialog).getByLabelText('Libellé (en)'), {
      target: { value: 'Sweets' },
    })
    fireEvent.change(within(dialog).getByLabelText('Slug'), { target: { value: 'desserts' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Desserts')).toBeDefined()
  })

  it('reports the server’s refusal rather than guessing, on a duplicate slug', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau terme' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Libellé (fr)'), { target: { value: 'Autre' } })
    fireEvent.change(within(dialog).getByLabelText('Slug'), { target: { value: 'cuisine' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('slug')
  })

  it('renames a term without moving its children — a rename touches no path', async () => {
    signedIn(['editor'], { taxonomyTerms: [CUISINE, DESSERTS] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')
    await screen.findByText('Desserts')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier Cuisine' }))
    const dialog = await screen.findByRole('dialog')
    const labelField = within(dialog).getByLabelText('Libellé (fr)') as HTMLInputElement
    expect(labelField.value).toBe('Cuisine')
    fireEvent.change(labelField, { target: { value: 'Gastronomie' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Gastronomie')).toBeDefined()
    // "Desserts" is still there, still nested — nothing about the child moved.
    expect(await screen.findByText('Desserts')).toBeDefined()
  })

  it('moves a term with the indent button, and the API reflects the new parent after reload', async () => {
    signedIn(['editor'], { taxonomyTerms: [CUISINE, DESSERTS, ENTREES] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Entrées')

    // "Entrées" nests under its immediately preceding sibling, "Desserts".
    fireEvent.click(
      screen.getByRole('button', { name: 'Imbriquer Entrées sous le terme précédent' }),
    )

    await waitFor(async () => {
      const response = await fetch('/api/taxonomies/topic', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const body = (await response.json()) as { data: { id: string; parent: string | null }[] }
      const entrees = body.data.find((term) => term.id === 'term-entrees')
      expect(entrees?.parent).toBe('term-desserts')
    })
  })

  it('reorders two siblings with the up button', async () => {
    signedIn(['editor'], { taxonomyTerms: [CUISINE, DESSERTS, ENTREES] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Entrées')

    fireEvent.click(screen.getByRole('button', { name: 'Monter Entrées' }))

    await waitFor(async () => {
      const response = await fetch('/api/taxonomies/topic', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const body = (await response.json()) as { data: { id: string }[] }
      const ids = body.data.map((term) => term.id)
      // "Entrées" now sorts before "Desserts" among Cuisine's children.
      expect(ids.indexOf('term-entrees')).toBeLessThan(ids.indexOf('term-desserts'))
    })
  })

  it('offers no delete button to an editor, who may not delete terms', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    // The server refuses this actor regardless (R4); the UI does not offer
    // a button whose only outcome would be a 403.
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nouveau terme' })).toBeDefined()
  })

  it('offers delete to an admin, showing usage before it happens, and removes the term', async () => {
    signedIn(['admin'], { taxonomyUsage: { 'term-existing': { own: 0, withDescendants: 0 } } })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Cuisine' }))
    const dialog = await screen.findByRole('dialog')
    // Nothing is classified with it — the modal says so before asking to confirm.
    await within(dialog).findByText("Aucune entrée n'est classée avec ce terme.")
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText("Aucun terme pour l'instant.")).toBeDefined()
  })

  it('proposes cascading rather than a plain delete when the term still has children', async () => {
    signedIn(['admin'], { taxonomyTerms: [CUISINE, DESSERTS] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Cuisine')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Cuisine' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('button', { name: /sous-terme avec lui/ })

    // No plain "Supprimer" button when there are descendants — only cancel
    // or the explicit cascade, naming how many terms go with it.
    expect(within(dialog).queryByRole('button', { name: 'Supprimer' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: /sous-terme avec lui/ }))

    await waitFor(() => expect(screen.queryByText('Desserts')).toBeNull())
  })

  it('offers no create form to a role that may only read', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToTaxonomies()

    // `read` is open to `public`, so a viewer still sees the tree.
    expect(await screen.findByText('Cuisine')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Nouveau terme' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).toBeNull()
  })

  it('filters to a flat, searchable list of matches, accent- and case-insensitive', async () => {
    signedIn(['editor'], { taxonomyTerms: [CUISINE, DESSERTS, ENTREES] })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Desserts')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'DESSERT' } })

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Desserts')).toBeDefined()
    expect(within(table).queryByText('Entrées')).toBeNull()
    // The flat row shows the ancestry a nested view would otherwise convey.
    expect(within(table).getByText('Cuisine')).toBeDefined()
  })

  it('finds the unused terms of a taxonomy with the "unused only" filter', async () => {
    signedIn(['editor'], {
      taxonomyTerms: [CUISINE, DESSERTS],
      taxonomyUsage: { 'term-existing': { own: 3, withDescendants: 3 } },
    })
    render(<App />)
    await goToTaxonomies()
    await screen.findByText('Desserts')

    fireEvent.click(screen.getByLabelText('Termes non utilisés uniquement'))

    const table = await screen.findByRole('table')
    // "Cuisine" (used, own: 3) is excluded; "Desserts" (unused) is the only
    // data row. Checking cell-by-cell rather than a bare text search: the
    // one remaining row's own ancestry column legitimately says "Cuisine".
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0] as HTMLElement).getByText('Desserts')).toBeDefined()
  })
})
