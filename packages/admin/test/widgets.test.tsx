import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, mockWidgets, VALID_TOKEN, widgetWrites } from './helpers/mock-fetch.js'

/**
 * The Widgets screen (L30): areas of the active theme, a library to add
 * widgets to them, and per widget the moves, hiding, duplication and removal
 * a WordPress user expects — every one of them a named control.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

const VISIBLE_EVERYWHERE = {
  pages: { mode: 'all', targets: [] },
  audience: 'everyone',
  devices: { desktop: true, tablet: true, mobile: true },
  from: null,
  until: null,
  locales: [],
}

function seed(): void {
  mockWidgets.splice(0, mockWidgets.length)
  widgetWrites.splice(0, widgetWrites.length)
  for (const [index, title] of ['Newsletter', 'À propos'].entries()) {
    mockWidgets.push({
      id: `seed-${index}`,
      area: 'sidebar',
      position: index,
      type: 'text',
      title,
      settings: { body: [] },
      visibility: VISIBLE_EVERYWHERE,
      enabled: true,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
      updatedBy: null,
    })
  }
}

function open(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
  window.history.pushState(null, '', '/widgets')
  render(<App />)
}

function area(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

beforeEach(seed)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Widgets screen', () => {
  it('lists the theme areas with the widgets placed in them, in order', async () => {
    open(['admin'])
    const sidebar = await screen.findByRole('region', { name: 'Barre latérale' })
    const items = within(sidebar).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Newsletter'),
      expect.stringContaining('À propos'),
    ])
    expect(area('Pied de page, colonne 1').textContent).toContain('Aucun')
  })

  it('adds a widget from the library through the editor, into the chosen area', async () => {
    open(['admin'])
    await screen.findByRole('region', { name: 'Barre latérale' })

    fireEvent.change(screen.getByLabelText('Zone de destination'), {
      target: { value: 'footer-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le widget Recherche' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Pied de page, colonne 2')
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'Chercher' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(within(area('Pied de page, colonne 2')).getByText('Chercher')).toBeDefined(),
    )
    expect(mockWidgets.find((widget) => widget.title === 'Chercher')?.area).toBe('footer-2')
  })

  it("keeps the editor open and shows the server's refusal in its own words", async () => {
    open(['admin'])
    await screen.findByRole('region', { name: 'Barre latérale' })

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le widget Citation' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Citation'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await within(dialog).findByText(/Write the quotation\./u)).toBeDefined()
    expect(mockWidgets).toHaveLength(2)
  })

  it('hides a widget without removing it, then shows it again', async () => {
    open(['admin'])
    const sidebar = await screen.findByRole('region', { name: 'Barre latérale' })
    const first = within(sidebar).getAllByRole('listitem')[0] as HTMLElement

    fireEvent.click(within(first).getByRole('button', { name: 'Masquer' }))
    await waitFor(() => expect(mockWidgets[0]?.enabled).toBe(false))
    const hidden = within(area('Barre latérale')).getAllByRole('listitem')[0] as HTMLElement
    await waitFor(() => expect(within(hidden).getByText('Masqué')).toBeDefined())

    fireEvent.click(within(hidden).getByRole('button', { name: 'Afficher' }))
    await waitFor(() => expect(mockWidgets[0]?.enabled).toBe(true))
  })

  it('reorders with named buttons and moves a widget to another area', async () => {
    open(['admin'])
    await screen.findByRole('region', { name: 'Barre latérale' })

    fireEvent.click(screen.getByRole('button', { name: 'Descendre Newsletter' }))
    await waitFor(() =>
      expect(
        within(area('Barre latérale'))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([expect.stringContaining('À propos'), expect.stringContaining('Newsletter')]),
    )

    fireEvent.change(screen.getByLabelText('Déplacer À propos vers une autre zone'), {
      target: { value: 'footer-1' },
    })
    await waitFor(() =>
      expect(within(area('Pied de page, colonne 1')).getByText('À propos')).toBeDefined(),
    )
    expect(widgetWrites.map((write) => write.method)).toEqual(['MOVE', 'MOVE'])
  })

  it('duplicates a widget as a hidden copy and deletes only after confirmation', async () => {
    open(['admin'])
    const sidebar = await screen.findByRole('region', { name: 'Barre latérale' })
    const first = within(sidebar).getAllByRole('listitem')[0] as HTMLElement

    fireEvent.click(within(first).getByRole('button', { name: 'Dupliquer' }))
    await waitFor(() =>
      expect(within(area('Barre latérale')).getAllByRole('listitem')).toHaveLength(3),
    )

    const target = within(area('Barre latérale')).getAllByRole('listitem')[0] as HTMLElement
    fireEvent.click(within(target).getByRole('button', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('dialog')
    expect(mockWidgets).toHaveLength(3)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(mockWidgets).toHaveLength(2))
    expect(widgetWrites.map((write) => write.method)).toEqual(['DUPLICATE', 'DELETE'])
  })

  it('previews the site itself and reloads it after a change', async () => {
    open(['admin'])
    await screen.findByRole('region', { name: 'Barre latérale' })

    const preview = screen.getByRole('region', { name: 'Aperçu' })
    const frame = within(preview).getByTitle('Aperçu du site')
    expect(frame.getAttribute('src')).toBe('/?cg-preview=0')
    // The pages offered are the ones the site's own sitemap advertises.
    const pages = within(preview).getByLabelText('Page')
    await waitFor(() =>
      expect([...(pages as HTMLSelectElement).options].map((option) => option.value)).toEqual([
        '/',
        '/blog/bread-at-home',
        '/about',
      ]),
    )

    const sidebar = area('Barre latérale')
    fireEvent.click(within(sidebar).getAllByRole('button', { name: 'Masquer' })[0] as HTMLElement)
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Aperçu' }))
          .getByTitle('Aperçu du site')
          .getAttribute('src'),
      ).toBe('/?cg-preview=1'),
    )

    fireEvent.change(pages, { target: { value: '/about' } })
    expect(
      within(screen.getByRole('region', { name: 'Aperçu' }))
        .getByTitle('Aperçu du site')
        .getAttribute('src'),
    ).toBe('/about?cg-preview=1')
  })

  it('tells a non-admin that widgets are managed by an administrator', async () => {
    open(['editor'])
    expect(await screen.findByText('Seul un administrateur peut gérer les widgets.')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Ajouter le widget/u })).toBeNull()
  })
})
