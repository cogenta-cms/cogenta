import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import {
  installMockFetch,
  mockPluginDisabled,
  mockPluginDrafts,
  mockPluginGrants,
  mockPluginsInstalled,
  resetMockPlugins,
  VALID_TOKEN,
} from './helpers/mock-fetch.js'

/**
 * The Plugins screen, after it was called too technical: a person creates a
 * plugin by naming it and picking what it should do, reads what each one is
 * allowed to do in words rather than identifiers, and can turn one off or
 * remove it.
 *
 * The rule underneath has not moved, and is asserted here rather than
 * assumed: installing grants nothing, and each permission is a separate yes.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

function open(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
  window.history.pushState(null, '', '/plugins')
  render(<App />)
}

beforeEach(() => {
  resetMockPlugins()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Plugins screen', () => {
  it('says what a plugin may do in words, and that it holds none of it yet', async () => {
    open(['admin'])
    await screen.findByRole('heading', { name: 'Plugins' })

    expect(await screen.findByText('demo-notes')).toBeDefined()
    // The sentence, not the identifier — with the identifier still there for
    // whoever is auditing rather than deciding.
    expect(screen.getByText('Écrire ses propres fichiers')).toBeDefined()
    expect(screen.getByText(/storage\.write:plugins\/demo-notes/u)).toBeDefined()
    expect(screen.getByText("S'exécute à chaque content.publish.")).toBeDefined()
    expect(screen.getAllByText('Non accordée')).toHaveLength(2)
  })

  it('grants one permission at a time, and takes it back', async () => {
    open(['admin'])
    await screen.findByText('Écrire ses propres fichiers')

    fireEvent.click(screen.getAllByRole('button', { name: 'Autoriser' })[0] as HTMLElement)
    await waitFor(() => expect(mockPluginGrants).toEqual(['storage.write:plugins/demo-notes']))
    await screen.findByText('Accordée')

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(mockPluginGrants).toEqual([]))
  })

  it('creates a plugin from a name and a purpose, never from a directory id', async () => {
    open(['admin'])
    await screen.findByRole('heading', { name: 'Plugins' })

    fireEvent.click(screen.getByRole('button', { name: 'Créer un plugin' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom du plugin'), {
      target: { value: 'Lettre information' },
    })
    fireEvent.click(within(dialog).getByRole('radio', { name: /Réagir à une publication/u }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }))

    await waitFor(() =>
      expect(mockPluginDrafts.map((draft) => draft.id)).toContain('lettre-information'),
    )
    // Created, and opened: a person lands on the code, not on a list.
    expect(await screen.findByText('Prêt à installer')).toBeDefined()
    expect(
      screen.getByText(/Une fois installé, il demandera : Lire le contenu du site/u),
    ).toBeDefined()
  })

  it('installs a draft on demand, and says installing grants nothing', async () => {
    open(['admin'])
    await screen.findByRole('heading', { name: 'Plugins' })

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(await screen.findByText('Prêt à installer')).toBeDefined()
    expect(screen.getByText(/Installer n'accorde aucune permission/u)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Installer' }))
    await waitFor(() =>
      expect(mockPluginsInstalled.map((plugin) => plugin.name)).toContain('atelier'),
    )
  })

  it('turns a plugin off, and says who turned it off', async () => {
    open(['admin'])
    await screen.findByText('demo-notes')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    await waitFor(() => expect(mockPluginDisabled.has('demo-notes')).toBe(true))
    expect(
      await screen.findByText("Vous avez désactivé ce plugin. Le site ne l'exécute plus."),
    ).toBeDefined()
    expect(screen.getByText('Désactivé')).toBeDefined()
  })

  it('asks before uninstalling, and only then removes the plugin', async () => {
    open(['admin'])
    await screen.findByText('demo-notes')

    fireEvent.click(screen.getByRole('button', { name: 'Désinstaller' }))
    // One click asks; nothing has happened yet.
    expect(mockPluginsInstalled).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la désinstallation' }))
    await waitFor(() => expect(mockPluginsInstalled).toHaveLength(0))
  })

  it('asks before throwing a draft away', async () => {
    open(['admin'])
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    await screen.findByText('Prêt à installer')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(mockPluginDrafts).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    await waitFor(() => expect(mockPluginDrafts).toHaveLength(0))
  })

  it('tells a non-admin that plugins are managed by an administrator', async () => {
    open(['editor'])
    expect(await screen.findByText('Seul un administrateur peut gérer les plugins.')).toBeDefined()
  })
})
