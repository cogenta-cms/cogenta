import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Apparence de l'admin" (L21 task 2, restructured by fiche 49) — the
 * admin's own runtime template + personalisation screen, deliberately
 * distinct from "Apparence" (the public site's theming, fiche 14 —
 * `appearance.test.tsx`). Every assertion here checks a real round trip
 * through the mocked `/api/admin-theme` surface, never a snapshot of markup
 * alone.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'
const HEAD_STYLE_ID = 'cogenta-admin-theme-overrides'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function goToAdminAppearance(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: "Apparence de l'admin" }))
  await screen.findByRole('heading', { name: "Apparence de l'admin", level: 1 })
}

function headOverrideStyle(): string {
  return document.getElementById(HEAD_STYLE_ID)?.textContent ?? ''
}

describe("the admin's own appearance screen", () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/admin-appearance')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows both built-in templates, Nightops active by default, gallery only (no personalisation controls)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    // `Nightops`/`Atelier` also appear as plain text inside each card's own
    // real preview panel (`AdminThemePreview`) — the card's own `<h3>` is the
    // unambiguous query.
    expect(await screen.findByRole('heading', { name: 'Nightops', level: 3 })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Atelier', level: 3 })).toBeDefined()
    expect(screen.getByText('Actif')).toBeDefined()

    // The gallery view never shows the personalisation form's own controls.
    expect(screen.queryByLabelText('Couleur primaire')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('navigates between the gallery and the personalisation view and back', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }))
    expect(await screen.findByLabelText('Couleur primaire')).toBeDefined()
    // Once in the personalisation view, the gallery's own template cards are gone.
    expect(screen.queryByRole('button', { name: 'Utiliser ce modèle' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retour à la galerie' }))
    expect(await screen.findByRole('heading', { name: 'Nightops', level: 3 })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Atelier', level: 3 })).toBeDefined()
    expect(screen.queryByLabelText('Couleur primaire')).toBeNull()
  })

  it('choosing Atelier and saving makes it the active template, and the choice survives a reload', async () => {
    signedIn(['admin'])
    const first = render(<App />)
    await goToAdminAppearance()

    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ce modèle' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Enregistré.')).toBeDefined())
    // Back to the gallery — fiche 71 put the view in `?view=`, so a reload
    // now lands on whichever view was showing (proven by this file's own
    // "?view=customize" tests below); returning here first is what makes
    // this specific assertion (the gallery's "Actif" badge) meaningful.
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la galerie' }))
    await screen.findByRole('heading', { name: 'Nightops', level: 3 })
    first.unmount()

    // A fresh mount re-fetches `/api/admin-theme` — the choice must have
    // actually been persisted server-side, not merely held in local state.
    // (The session token is still in `localStorage`, so this mount lands
    // straight on the screen rather than the dashboard.)
    render(<App />)
    await screen.findByRole('heading', { name: "Apparence de l'admin", level: 1 })
    const actives = await screen.findAllByText('Actif')
    expect(actives).toHaveLength(1)
  })

  it('personalising the primary colour and saving round-trips the value', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }))

    const primaryInput = await screen.findByLabelText('Couleur primaire')
    fireEvent.change(primaryInput, { target: { value: '#123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByText('Enregistré.')).toBeDefined())
    expect((screen.getByLabelText('Couleur primaire') as HTMLInputElement).value).toBe('#123456')
  })

  it('reflects an unsaved colour change in the live preview, without touching the running admin', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }))

    const primaryInput = await screen.findByLabelText('Couleur primaire')
    // Before any edit, the head-level override (the real, running theme)
    // never mentions the colour we are about to type.
    expect(headOverrideStyle()).not.toContain('#654321')

    fireEvent.change(primaryInput, { target: { value: '#654321' } })

    // The scoped preview panel picks up the pending edit immediately...
    const previewStyle = document.querySelector(
      '[data-admin-theme-preview] style',
    ) as HTMLStyleElement | null
    expect(previewStyle).not.toBeNull()
    await waitFor(() => expect(previewStyle?.textContent ?? '').toContain('--primary: #654321;'))

    // ...but `<head>`'s own override, which paints the rest of the running
    // admin, must not have moved: an unsaved edit must never repaint the
    // page around the screen the user is still editing.
    expect(headOverrideStyle()).not.toContain('#654321')

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(screen.getByText('Enregistré.')).toBeDefined())

    // Only *after* saving does the real, page-wide theme pick up the change.
    expect(headOverrideStyle()).toContain('#654321')
  })

  it('reflects an unsaved font change in the live preview before saving', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }))

    const bodyFontSelect = await screen.findByLabelText('Police de texte')
    fireEvent.change(bodyFontSelect, { target: { value: 'plex-sans' } })

    const previewStyle = document.querySelector(
      '[data-admin-theme-preview] style',
    ) as HTMLStyleElement | null
    expect(previewStyle).not.toBeNull()
    await waitFor(() =>
      expect(previewStyle?.textContent ?? '').toContain(
        '--font-sans: "Plex Sans", "Segoe UI", system-ui, sans-serif;',
      ),
    )
  })

  it('resets to the persisted template when re-entering personalisation after an abandoned switch', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    // Switch to Atelier, but never save — then leave without saving.
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ce modèle' }))
    await screen.findByLabelText('Couleur primaire')
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la galerie' }))

    // Nightops is still the persisted, active template.
    await screen.findByText('Actif')
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser' }))

    // Editing now targets Nightops again, not the abandoned Atelier switch.
    const preview = within(document.body).getAllByText('Nightops')
    expect(preview.length).toBeGreaterThan(0)
  })

  it('writes ?view=customize into the URL when opening the personalisation view (fiche 71)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToAdminAppearance()

    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }))
    await screen.findByLabelText('Couleur primaire')

    expect(window.location.search).toContain('view=customize')
  })

  it('shows the personalisation view straight away when the URL already carries ?view=customize (fiche 71)', async () => {
    signedIn(['admin'])
    window.history.pushState(null, '', '/admin-appearance?view=customize')
    render(<App />)

    expect(await screen.findByLabelText('Couleur primaire')).toBeDefined()
  })

  it('is a distinct screen from the public site\'s own "Apparence"', async () => {
    signedIn(['admin'])
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.getByRole('link', { name: 'Apparence du site' })).toBeDefined()
    expect(screen.getByRole('link', { name: "Apparence de l'admin" })).toBeDefined()
  })
})
