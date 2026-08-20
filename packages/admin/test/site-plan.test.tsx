import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * L19 task 5's rule, checked at the one place a user could get round it: the
 * screen. "Validation section par section, jamais une case « tout accepter »
 * qui masque le détail."
 *
 * The interesting assertions here are the negative ones. There is no control
 * that decides more than one item, and Apply stays disabled until every item
 * has been answered — not because the server would refuse (it would), but
 * because a button that looks available and then fails is how a review turns
 * into a rubber stamp people click through.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToSitePlan(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Plan du site' }))
  await screen.findByRole('heading', { name: 'Plan du site', level: 1 })
}

function signIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

async function openTheDraft(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'A neighbourhood restaurant.' }))
  await screen.findByRole('heading', { name: 'Relecture, élément par élément' })
}

describe('the site plan screen', () => {
  it('shows nothing to a role below admin', async () => {
    signIn(['editor'])
    // The whole "IA" nav group is hidden for a role that sees no item in it
    // (fiche 35), so there is no link to click — go straight to the route,
    // the same way a bookmarked URL would.
    window.history.pushState(null, '', '/site-plan')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('lists a waiting proposal with the document it came from', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()

    expect(await screen.findByRole('button', { name: 'A neighbourhood restaurant.' })).toBeDefined()
    expect(screen.getByText(/brief\.md/)).toBeDefined()
  })

  it('shows what each item actually means, not only its name', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()
    await openTheDraft()

    // A constraint carries the sentence it was read from.
    expect(screen.getByText(/Read from brief\.md/)).toBeDefined()
    // A collection carries its fields.
    expect(screen.getByText(/Fields: title \(text\)/)).toBeDefined()
    // And what was already removed is said out loud.
    expect(screen.getByText(/rules out blog/)).toBeDefined()
  })
})

describe('there is no way to accept everything at once', () => {
  it('offers no control that decides more than one item', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()
    await openTheDraft()

    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '')
    for (const forbidden of ['Tout accepter', 'Tout garder', 'Accept all', 'Select all']) {
      expect(labels.some((label) => label.includes(forbidden))).toBe(false)
    }
    // Every non-alternative item has its own pair of buttons.
    expect(screen.getAllByRole('button', { name: 'Garder' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(2)
  })

  it('keeps Apply disabled, and counts what is left, until every item is decided', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()
    await openTheDraft()

    const apply = screen.getByRole('button', { name: "Appliquer ce que j'ai accepté" })
    expect(apply).toHaveProperty('disabled', true)
    expect(screen.getByText(/4 éléments restent à trancher/)).toBeDefined()

    // Decide the two "each" items…
    for (const button of screen.getAllByRole('button', { name: 'Garder' })) {
      fireEvent.click(button)
    }
    expect(screen.getByText(/2 éléments restent à trancher/)).toBeDefined()
    expect(apply).toHaveProperty('disabled', true)

    // …then the design, whose two alternatives are settled by one choice.
    fireEvent.click(screen.getByRole('radio', { name: 'Clean and clinical' }))

    await waitFor(() => {
      expect(screen.getByText(/Tous les éléments sont tranchés/)).toBeDefined()
    })
    expect(apply).toHaveProperty('disabled', false)
  })

  it('records the designs it did not pick as refused, not merely as absent', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()
    await openTheDraft()

    fireEvent.click(screen.getByRole('radio', { name: 'Clean and clinical' }))

    expect(screen.getByRole('radio', { name: 'Clean and clinical' })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.getByRole('radio', { name: 'Warm editorial' })).toHaveProperty('checked', false)
    // Both are counted as decided: choosing one is a decision about both.
    expect(screen.getByText(/2 éléments restent à trancher/)).toBeDefined()
  })
})

describe('applying a fully reviewed plan', () => {
  it('reports what it did and what the operator still has to do', async () => {
    signIn(['admin'])

    render(<App />)
    await goToSitePlan()
    await openTheDraft()

    for (const button of screen.getAllByRole('button', { name: 'Garder' })) {
      fireEvent.click(button)
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Clean and clinical' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: "Appliquer ce que j'ai accepté" })).toHaveProperty(
        'disabled',
        false,
      )
    })

    fireEvent.click(screen.getByRole('button', { name: "Appliquer ce que j'ai accepté" }))

    expect(await screen.findByText(/Restart `cogenta serve`/)).toBeDefined()
  })
})
