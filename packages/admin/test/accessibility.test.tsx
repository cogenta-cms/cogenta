import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * L2 task 16: axe-core against every main view, in its most populated state
 * (a loaded list beats an empty one, a filled form beats a blank one — a
 * hidden label or a missing landmark is far more likely to show up once a
 * view has real content). "Zero serious violations" is the lot's own bar,
 * not zero violations of any severity — see `helpers/axe.ts`.
 */
describe('WCAG 2.2 AA — main views', () => {
  it('login page', async () => {
    localStorage.clear()
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
    await expectNoSeriousA11yViolations(document.body)
  })
})

describe('WCAG 2.2 AA — authenticated views', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  })

  it('dashboard, for an admin', async () => {
    installMockFetch({ roles: ['admin'] })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    await screen.findByText(/content\.create/)
    await expectNoSeriousA11yViolations(document.body)
  })

  it('collections list', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByText('Articles')
    await expectNoSeriousA11yViolations(document.body)
  })

  it('collection list, populated', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByText('Articles')
    fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
    await screen.findByText('First article')
    await expectNoSeriousA11yViolations(document.body)
  })

  it('entry edit form', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByText('Articles')
    fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
    await screen.findByText('First article')
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })
    await expectNoSeriousA11yViolations(document.body)
  })

  it('visual page builder, with a block placed and selected', async () => {
    // The builder is the one screen of this admin whose primary affordance —
    // dragging — no assistive technology can use, so it is the one that most
    // needs this: every move it offers also exists as a named button, and
    // this is where that claim is checked rather than asserted.
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByText('Articles')
    fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
    await screen.findByText('First article')
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Composition visuelle' }))
    await screen.findByTitle('Aperçu de la page')
    fireEvent.click(screen.getByRole('button', { name: /^Héros/u }))

    await expectNoSeriousA11yViolations(document.body, { exclude: ['iframe'] })
  })

  it('media library, populated', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))
    await screen.findByRole('heading', { name: 'Médiathèque' })

    fireEvent.change(screen.getByLabelText('Fichier'), {
      target: { files: [new File(['fake-png-bytes'], 'cover.png', { type: 'image/png' })] },
    })
    fireEvent.change(screen.getByLabelText('Texte alternatif', { exact: false }), {
      target: { value: 'A red bicycle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }))
    await screen.findByText('cover.png')

    await expectNoSeriousA11yViolations(document.body)
  })

  it('audit log, for an admin', async () => {
    installMockFetch({ roles: ['admin'] })
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: "Journal d'audit" }))
    await screen.findByText('content.create')
    await expectNoSeriousA11yViolations(document.body)
  })

  it('account settings', async () => {
    installMockFetch()
    render(<App />)

    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Paramètres' }))
    await screen.findByRole('heading', { name: 'Paramètres du compte' })
    await expectNoSeriousA11yViolations(document.body)
  })
})
