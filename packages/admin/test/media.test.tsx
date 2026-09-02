import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

/** A `DataTransfer` carrying real dropped files — `types` includes `'Files'`, which is exactly what tells a page-wide drop zone (fiche 05 task 1) apart from an internal asset drag (`setMediaDragData`'s own custom MIME type). */
function fileDropDataTransfer(files: readonly File[]): DataTransfer {
  return { types: ['Files'], files } as unknown as DataTransfer
}

describe('media library', () => {
  it('lists no media initially, and shows one after an upload', async () => {
    render(<App />)
    await goToMedia()

    await screen.findByText('Aucun média.')

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'A red bicycle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))

    // A button, not just the text: fiche 46's own upload form also shows the
    // picked filename in its own paragraph the instant a file is chosen —
    // `findByText('cover.png')` alone can resolve on that transient text
    // before the asset is actually created. Only the grid tile is a button.
    expect(await screen.findByRole('button', { name: /cover\.png/ })).toBeDefined()
    expect(screen.queryByText('Aucun média.')).toBeNull()
  })

  it('refuses to upload without alt text unless marked decorative', async () => {
    render(<App />)
    await goToMedia()

    // Fiche 46: the screen now also fetches the folder tree on mount, so the
    // empty state is no longer guaranteed to have rendered synchronously —
    // wait for it rather than asserting immediately.
    await screen.findByText('Aucun média.')

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

    // A grid tile (button), not just the text: the upload form shows the
    // picked filename in its own paragraph the instant a file is chosen,
    // well before the asset actually exists — asserting on plain text can
    // resolve on that transient copy and let the test finish while the real
    // upload is still in flight, which then lands as an orphaned request in
    // whichever test runs next (fiche 46 found this the hard way: it showed
    // up as a phantom "divider.png" tile in an unrelated later test).
    expect(await screen.findByRole('button', { name: /divider\.png/ })).toBeDefined()
  })

  it('opens the detail panel, edits alt text, and deletes the asset', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'Original alt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
    // A button, not just the text — see the "uploads a decorative image"
    // test's own comment above on why that distinction matters here.
    const tile = await screen.findByRole('button', { name: /cover\.png/ })

    fireEvent.click(tile)
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
 * Fiche 05 task 1 (audit `05-mediatheque.md` §6 T01): the real multipart
 * upload transport, upload limits shown before the first file is picked,
 * and a whole-page drop zone that starts an upload without ever needing the
 * form's own file picker.
 */
describe('media library — real upload transport (fiche 05 task 1)', () => {
  it('shows the upload size limit and accepted types before any file is picked', async () => {
    render(<App />)
    await goToMedia()

    // `GET /api/media/-/limits` — fetched once, rendered before a file is
    // even chosen, so a rejection is never a surprise.
    await screen.findByText(/250 MB/)
    expect(screen.getByText(/image\/png/)).toBeDefined()
  })

  it('uploading a file shows a real progress entry that clears once done', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'A red bicycle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))

    // The asset lands in the grid — proof the multipart transport actually
    // completed against the mock's own `XMLHttpRequest` stub, not `fetch`.
    expect(await screen.findByRole('button', { name: /cover\.png/ })).toBeDefined()
    // And the transient queue entry cleared once the upload finished —
    // "done" items are not left cluttering the panel forever.
    await waitFor(() => expect(screen.queryByText(/cover\.png —/)).toBeNull())
  })

  it('dropping a file anywhere on the page uploads it, without opening the upload form', async () => {
    render(<App />)
    await goToMedia()

    const section = screen.getByRole('heading', { name: 'Médiathèque' }).closest('section')
    expect(section).not.toBeNull()

    const dataTransfer = fileDropDataTransfer([pngFile('dropped-anywhere.png')])
    fireEvent.dragOver(section as HTMLElement, { dataTransfer })
    fireEvent.drop(section as HTMLElement, { dataTransfer })

    // Decorative-by-necessity — the same choice `MediaPicker`'s own drop
    // zone already made (fiche 03): a page-wide drop carries no alt text to
    // ask for, and this is never the only path to upload (the form above
    // still asks for a real description).
    expect(await screen.findByRole('button', { name: /dropped-anywhere\.png/ })).toBeDefined()
  })
})

/**
 * Fiche 46: the folder tree, and the bulk actions fiche 11 built server-side
 * but this screen never called. End-to-end against the real screen, not
 * just the router (`media-folder-router.test.ts` already proves the API).
 */
describe('media library folders', () => {
  it('creates a folder, moves an asset into it, and filtering by that folder shows only it', async () => {
    render(<App />)
    await goToMedia()

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau dossier' }))
    fireEvent.change(screen.getByLabelText('Nom du dossier'), {
      target: { value: 'Photos' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0] as HTMLElement)
    const photosFolderLink = await screen.findByRole('button', { name: 'Photos' })

    fireEvent.change(screen.getByLabelText('Fichier'), { target: { files: [pngFile()] } })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'A red bicycle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
    const tile = await screen.findByRole('button', { name: /cover\.png/ })

    fireEvent.click(tile)
    await screen.findByRole('heading', { name: 'cover.png' })
    const folderSelect = screen.getByLabelText('Dossier') as HTMLSelectElement
    const photosOption = within(folderSelect).getByText('Photos') as HTMLOptionElement
    fireEvent.change(folderSelect, { target: { value: photosOption.value } })

    // The move is confirmed by the folder select itself resolving.
    await waitFor(() => expect(folderSelect.value).toBe(photosOption.value))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    fireEvent.click(photosFolderLink)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /cover\.png/ })).toHaveLength(1)
    })

    // Two matches once a folder is selected: the sidebar's own entry, and
    // the breadcrumb's "back to all" link — either takes you back to "all".
    fireEvent.click(screen.getAllByRole('button', { name: 'Tous les médias' })[0] as HTMLElement)
    await screen.findByRole('button', { name: /cover\.png/ })
  })

  it('bulk-deletes every selected asset', async () => {
    installMockFetch({ mediaSeedCount: 3 })
    render(<App />)
    await goToMedia()

    await screen.findAllByRole('button', { name: /seed-\d+\.png/ })
    const checkboxes = screen.getAllByRole('checkbox', { name: /Sélectionner/ })
    fireEvent.click(checkboxes[0] as HTMLElement)
    fireEvent.click(checkboxes[1] as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /seed-\d+\.png/ })).toHaveLength(1)
    })
  })

  // Fiche 05 task 3: usage is checked before the confirmation dialog even
  // opens, so a selection that would orphan a real reference is impossible
  // to miss — and never a gate, only a warning (R6).
  it('warns, before confirming, that some selected files are still referenced by content', async () => {
    installMockFetch({
      mediaSeedCount: 3,
      mediaUsage: {
        'media-seed-1': [{ collection: 'article', entryId: 'entry-1', field: 'cover' }],
        'media-seed-2': [{ collection: 'article', entryId: 'entry-1', field: 'cover' }],
        'media-seed-3': [{ collection: 'article', entryId: 'entry-1', field: 'cover' }],
      },
    })
    render(<App />)
    await goToMedia()

    await screen.findAllByRole('button', { name: /seed-\d+\.png/ })
    const checkboxes = screen.getAllByRole('checkbox', { name: /Sélectionner/ })
    fireEvent.click(checkboxes[0] as HTMLElement)
    fireEvent.click(checkboxes[1] as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer (2)' }))

    await screen.findByText(/2 des fichiers sélectionnés sont encore référencés/)
    expect(screen.getAllByText(/article · entry-1 · cover/)).toHaveLength(2)
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
