import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, mockPluginGrants, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The Plugins screen (L31 step 4): what is installed, what it is allowed to
 * do, and the sandboxes a plugin is written in — where installing and
 * granting are two separate, deliberate acts.
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
  mockPluginGrants.splice(0, mockPluginGrants.length)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Plugins screen', () => {
  it('shows what a plugin asks for, and that it holds none of it yet', async () => {
    open(['admin'])
    await screen.findByRole('heading', { name: 'Plugins' })

    expect(await screen.findByText('demo-notes')).toBeDefined()
    expect(screen.getByText('storage.write:plugins/demo-notes')).toBeDefined()
    expect(screen.getAllByText('Non accordée')).toHaveLength(2)
  })

  it('grants one capability at a time, and takes it back', async () => {
    open(['admin'])
    await screen.findByText('storage.write:plugins/demo-notes')

    fireEvent.click(screen.getAllByRole('button', { name: 'Accorder' })[0] as HTMLElement)
    await waitFor(() => expect(mockPluginGrants).toEqual(['storage.write:plugins/demo-notes']))
    await screen.findByText('Accordée')

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(mockPluginGrants).toEqual([]))
  })

  it('opens a sandbox, shows what it checks out as, and installs it on demand', async () => {
    open(['admin'])
    await screen.findByRole('heading', { name: 'Plugins' })

    fireEvent.click(await screen.findByRole('button', { name: 'atelier' }))
    expect(await screen.findByText('Prêt à installer')).toBeDefined()
    expect(screen.getByText(/onContentEvent/u)).toBeDefined()

    // The screen says out loud that installing grants nothing.
    expect(screen.getByText(/Installer n'accorde aucune permission/u)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Installer' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Installer' })).toBeDefined())
  })

  it('tells a non-admin that plugins are managed by an administrator', async () => {
    open(['editor'])
    expect(await screen.findByText('Seul un administrateur peut gérer les plugins.')).toBeDefined()
  })
})
