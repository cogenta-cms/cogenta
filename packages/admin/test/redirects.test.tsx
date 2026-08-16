import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `/api/redirects` — admin-only, over the real API shape (audit follow-up to
 * L10 task 2). Unlike taxonomies or menus, there is no reader role here: the
 * screen itself refuses to render for anyone but an admin, matching the
 * server's own door.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function goToRedirects(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Redirections' }))
  await screen.findByRole('heading', { name: 'Redirections' })
}

describe('the redirects screen', () => {
  it('tells a non-admin the screen is admin-only, without offering a form', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToRedirects()

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByLabelText('Depuis')).toBeNull()
  })

  it('lets an admin create a redirect through the real API and see it listed', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/old-page' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/new-page' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))

    expect(await screen.findByText('/old-page')).toBeDefined()
    expect(screen.getByText('/new-page')).toBeDefined()
  })

  it('reports the server refusing a self-redirect', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/loop' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/loop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('redirect')
  })

  it('removes a redirect through the real API', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToRedirects()

    fireEvent.change(screen.getByLabelText('Depuis'), { target: { value: '/gone' } })
    fireEvent.change(screen.getByLabelText('Vers'), { target: { value: '/here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la redirection' }))
    await screen.findByText('/gone')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText("Aucune redirection pour l'instant.")).toBeDefined()
  })
})
