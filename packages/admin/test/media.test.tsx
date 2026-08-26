import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMedia(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))
  await screen.findByRole('heading', { name: 'Médiathèque' })
}

function pngFile(name = 'cover.png'): File {
  return new File(['fake-png-bytes'], name, { type: 'image/png' })
}

describe('media library', () => {
  it('lists no media initially, and shows one after an upload', async () => {
    render(<App />)
    await goToMedia()

    expect(screen.getByText('Aucun média.')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'A red bicycle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))

    expect(await screen.findByText('cover.png')).toBeDefined()
    expect(screen.queryByText('Aucun média.')).toBeNull()
  })

  it('refuses to upload without alt text unless marked decorative', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    const altInput = screen.getByLabelText('Texte alternatif', { exact: false }) as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))

    // The browser's own required-field validation refuses to fire `submit`
    // at all with the field left empty — the same rule the server enforces
    // (MediaStore) never even gets a request to reject.
    expect(altInput.validity.valid).toBe(false)
    expect(screen.getByText('Aucun média.')).toBeDefined()
  })

  it('uploads a decorative image with a justification and no alt text', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.change(screen.getByLabelText('Fichier'), {
      target: { files: [pngFile('divider.png')] },
    })
    fireEvent.click(screen.getByLabelText('Image décorative (aucune description nécessaire)'))
    fireEvent.change(
      screen.getByLabelText('Pourquoi cette image est décorative', { exact: false }),
      {
        target: { value: 'Purely ornamental divider.' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))

    expect(await screen.findByText('divider.png')).toBeDefined()
  })

  it('opens the detail panel, edits alt text, and deletes the asset', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'Original alt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
    await screen.findByText('cover.png')

    fireEvent.click(screen.getByRole('button', { name: /cover\.png/ }))
    await screen.findByRole('heading', { name: 'cover.png' })

    const altInputs = screen.getAllByDisplayValue('Original alt')
    fireEvent.change(altInputs[0] as HTMLInputElement, { target: { value: 'Updated alt' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0] as HTMLElement)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(screen.getByText('Aucun média.')).toBeDefined())
  })
})

/**
 * Fiche 67 task 2 — this screen's own client (`listMedia`) exposed a cursor
 * since L2 (`hasMore`/`nextCursor`); this route never sent `limit` or
 * consumed either field, so every request just loaded the store's own
 * default page in full. Proven here against a library bigger than one page,
 * the same way `users.tsx`'s pre-existing "load more" is proven elsewhere.
 */
describe('media library pagination', () => {
  it('loads the first page, then the rest on "load more"', async () => {
    installMockFetch({ mediaSeedCount: 30 })
    render(<App />)
    await goToMedia()

    expect(await screen.findAllByRole('button', { name: /seed-\d+\.png/ })).toHaveLength(25)
    expect(screen.queryByText('seed-30.png')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Charger la suite' }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /seed-\d+\.png/ })).toHaveLength(30)
    })
    expect(screen.getByText('seed-30.png')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Charger la suite' })).toBeNull()
  })

  it('shows no "load more" control when the library fits on one page', async () => {
    installMockFetch({ mediaSeedCount: 3 })
    render(<App />)
    await goToMedia()

    expect(await screen.findAllByRole('button', { name: /seed-\d+\.png/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Charger la suite' })).toBeNull()
  })
})
