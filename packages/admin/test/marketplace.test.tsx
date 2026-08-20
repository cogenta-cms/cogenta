import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The marketplace admin screens (L17): a catalog, a fiche détaillée, one-click
 * install, and an update that never widens permissions silently.
 *
 * French, like every other route test here — French is the interface's
 * default language, and `fr.json` is what actually renders unless a test
 * switches locale.
 *
 * The two tests that matter most for the DoD are the last two: a bad
 * signature never reads as a success, in either shape the admin can meet it
 * (blocked before install is even offered, or refused when install is
 * attempted), and an update that would widen capabilities only ever applies
 * after an explicit second confirmation.
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

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMarketplace(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Marketplace' }))
  await screen.findByRole('heading', { name: 'Marketplace' })
}

/** Fiche 29 task 1 split the screen into "Installées" (default) and "Découvrir" tabs — the catalog these existing L17 tests exercise lives under the latter. */
async function goToDiscoverTab(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Découvrir' }))
  await screen.findByLabelText('Rechercher')
}

describe('the marketplace catalog', () => {
  it('lists every item with its type, category and install status', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('SEO Helper')).toBeDefined()
    // More than one catalog item is not installed — several rows say so.
    expect(rows.getAllByText('Non installé').length).toBeGreaterThan(0)
    expect(rows.getByText('Installé (1.0.0)')).toBeDefined()
  })

  it('filters by free-text search', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('SEO Helper')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'forged' } })

    // The list reloads asynchronously — the table (and "Chargement…") comes
    // and goes, so this re-queries it after the fact rather than reusing a
    // reference captured before the reload.
    await within(await screen.findByRole('table')).findByText('Forged Plugin')
    expect(within(await screen.findByRole('table')).queryByText('SEO Helper')).toBeNull()
  })

  it('filters by type', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('SEO Helper')

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'theme' } })

    expect(await screen.findByText('Aucun élément ne correspond à ces filtres.')).toBeDefined()
  })

  it('tells a non-admin plainly instead of showing a catalog it cannot install from', async () => {
    signedInAs(['editor'])
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/marketplace')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin » : un élément de la marketplace exécute du code sur ce site.',
    )
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('the fiche détaillée', () => {
  it('shows description, changelog and plain-language capabilities', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('SEO Helper')

    fireEvent.click(screen.getByRole('button', { name: 'SEO Helper' }))
    const dialog = await screen.findByRole('dialog', { name: 'SEO Helper' })

    expect(within(dialog).getByText('Suggests meta descriptions for your pages.')).toBeDefined()
    expect(within(dialog).getByText(/First release\./u)).toBeDefined()
    expect(within(dialog).getByText('Read your content.')).toBeDefined()
    expect(within(dialog).getByText('Signature vérifiée')).toBeDefined()
  })
})

describe('installing an item', () => {
  it('installs on approval and shows that the signature was verified', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('SEO Helper')

    fireEvent.click(screen.getByRole('button', { name: 'SEO Helper' }))
    const dialog = await screen.findByRole('dialog', { name: 'SEO Helper' })
    const scoped = within(dialog)

    fireEvent.click(scoped.getByLabelText('Read your content.'))
    fireEvent.click(scoped.getByRole('button', { name: 'Autoriser les permissions cochées' }))

    expect(
      await scoped.findByText('« SEO Helper » a été installé. Sa signature a été vérifiée.'),
    ).toBeDefined()
  })

  it('never shows a signature-refused item as installable, and says so clearly', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('Forged Plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Forged Plugin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Forged Plugin' })
    const scoped = within(dialog)

    expect(
      await scoped.findByText(
        "La signature de cet élément n'a pas pu être vérifiée, il ne peut donc pas être installé : The plugin signature does not match a trusted key.",
      ),
    ).toBeDefined()
    // No install control is offered at all for a rejected signature — never
    // a button whose only outcome would be a refusal already known.
    expect(scoped.queryByRole('button', { name: /Autoriser/u })).toBeNull()
  })

  it('shows the refusal plainly when installing itself is what fails, never a false success', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('Flaky Signature Plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Flaky Signature Plugin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Flaky Signature Plugin' })
    const scoped = within(dialog)

    fireEvent.click(scoped.getByRole('button', { name: 'Tout autoriser sans les lire un par un' }))

    const failure = await scoped.findByText(/^Installation refusée : /u)
    expect(failure.textContent).toContain('trusted key')
    expect(scoped.queryByText(/a été installé/u)).toBeNull()
  })
})

describe('updating an installed item that would widen its permissions', () => {
  it('never applies on the first click, and only applies after explicit confirmation', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('Widening Plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Widening Plugin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Widening Plugin' })
    const scoped = within(dialog)

    await scoped.findByText('Installé (version 1.0.0).')
    fireEvent.click(scoped.getByRole('button', { name: 'Vérifier une mise à jour' }))

    // The confirmation screen appears, showing the widened permission —
    // nothing has been applied yet.
    await scoped.findByText('Cette mise à jour demande des permissions élargies')
    expect(scoped.getByText('Publish or unpublish content on your behalf.')).toBeDefined()
    expect(scoped.queryByText(/a été mis à jour/u)).toBeNull()

    fireEvent.click(scoped.getByLabelText('Publish or unpublish content on your behalf.'))
    fireEvent.click(
      scoped.getByRole('checkbox', {
        name: "Je comprends et j'autorise cette action à risque élevé",
      }),
    )
    fireEvent.click(scoped.getByRole('button', { name: 'Autoriser les permissions cochées' }))

    expect(await scoped.findByText('« Widening Plugin » a été mis à jour.')).toBeDefined()
  })

  it('lets the admin cancel instead of confirming the widened permissions', async () => {
    render(<App />)
    await goToMarketplace()
    await goToDiscoverTab()
    await within(await screen.findByRole('table')).findByText('Widening Plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Widening Plugin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Widening Plugin' })
    const scoped = within(dialog)

    fireEvent.click(scoped.getByRole('button', { name: 'Vérifier une mise à jour' }))
    await scoped.findByText('Cette mise à jour demande des permissions élargies')

    fireEvent.click(scoped.getByRole('button', { name: 'Annuler' }))

    expect(scoped.queryByText('Cette mise à jour demande des permissions élargies')).toBeNull()
    expect(scoped.getByRole('button', { name: 'Vérifier une mise à jour' })).toBeDefined()
  })
})

describe('fiche 29 — the installed extensions screen (task 1)', () => {
  it('is the default tab, and lists the pre-installed item', async () => {
    render(<App />)
    await goToMarketplace()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('Widening Plugin')).toBeDefined()
    expect(rows.getByText('Active')).toBeDefined()
  })

  it('deactivating and reactivating toggles the shown status', async () => {
    render(<App />)
    await goToMarketplace()
    const table = await screen.findByRole('table')
    await within(table).findByText('Widening Plugin')

    fireEvent.click(within(table).getByRole('button', { name: 'Désactiver' }))
    await within(table).findByText('Désactivée')

    fireEvent.click(within(table).getByRole('button', { name: 'Activer' }))
    await within(table).findByText('Active')
  })

  it('flags an available update, and offers "review & update" when it would widen permissions', async () => {
    render(<App />)
    await goToMarketplace()
    const table = await screen.findByRole('table')
    await within(table).findByText('Widening Plugin')

    expect(await screen.findByText('1 mise à jour est disponible.', { exact: false })).toBeDefined()
    expect(within(table).getByRole('button', { name: 'Examiner et mettre à jour' })).toBeDefined()
  })

  it('a grouped "update all" skips the item and reports it needs review', async () => {
    render(<App />)
    await goToMarketplace()
    await screen.findByText('1 mise à jour est disponible.', { exact: false })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Tout mettre à jour (sauf ce qui demande de nouvelles permissions)',
      }),
    )

    expect(await screen.findByText('0 mises à jour, 1 à examiner, 0 en échec.')).toBeDefined()
  })

  it('uninstalling asks for confirmation and offers to remove data', async () => {
    render(<App />)
    await goToMarketplace()
    const table = await screen.findByRole('table')
    await within(table).findByText('Widening Plugin')

    fireEvent.click(within(table).getByRole('button', { name: 'Désinstaller' }))
    const dialog = await screen.findByRole('dialog', { name: 'Désinstaller « Widening Plugin »' })
    const scoped = within(dialog)

    expect(scoped.getByLabelText(/Supprimer aussi ses données/u)).toBeDefined()
    fireEvent.click(scoped.getByRole('button', { name: 'Désinstaller' }))

    await screen.findByText("Aucune extension n'est installée pour l'instant.")
  })

  it('shows the plugin author guide and starter template links', async () => {
    render(<App />)
    await goToMarketplace()

    expect(screen.getByRole('link', { name: 'Guide pour les auteurs de plugins' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Modèle de démarrage de plugin' })).toBeDefined()
  })
})
