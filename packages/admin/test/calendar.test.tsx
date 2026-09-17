import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { dayKey, toLocalInputValue } from '../src/calendar/calendar-dates.js'
import { installMockFetch, scheduleCalls, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * « Calendrier éditorial » (L35). What these hold the screen to: entries sit
 * on the local day they come out, a date can be moved **without dragging**,
 * dragging does the very same write, and what is already out does not move.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  scheduleCalls.splice(0, scheduleCalls.length)
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['editor'] })
  window.history.pushState(null, '', '/calendar')
  render(<App />)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function inTwoDays(): Date {
  const soon = new Date()
  soon.setDate(soon.getDate() + 2)
  soon.setHours(10, 30, 0, 0)
  return soon
}

describe('the editorial calendar', () => {
  it('puts each entry on the day it comes out, and lists the drafts still to place', async () => {
    const chip = await screen.findByRole('button', { name: /Second article/u })
    expect(chip.closest('[data-day]')?.getAttribute('data-day')).toBe(dayKey(inTwoDays()))

    const waiting = screen.getByRole('button', { name: /Idea for later/u })
    expect(waiting.closest('[data-day]')).toBeNull()
  })

  it('reschedules from the dialog, with no dragging at all', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Second article/u }))
    const dialog = await screen.findByRole('dialog')

    const next = new Date()
    next.setDate(next.getDate() + 10)
    next.setHours(8, 0, 0, 0)
    fireEvent.change(within(dialog).getByLabelText('Date et heure de publication'), {
      target: { value: toLocalInputValue(next) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprogrammer' }))

    await waitFor(() => expect(scheduleCalls).toHaveLength(1))
    expect(scheduleCalls[0]).toEqual({
      id: 'entry-2',
      status: 'scheduled',
      publishedAt: next.toISOString(),
    })
  })

  it('moves an entry dropped on another day, keeping its time', async () => {
    const chip = await screen.findByRole('button', { name: /Second article/u })
    const store = new Map<string, string>()
    const dataTransfer = {
      types: ['application/x-cogenta-calendar-entry'],
      effectAllowed: 'all',
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
    }
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const target = document.querySelector(`[data-day="${dayKey(tomorrow)}"]`)
    if (target === null) throw new Error('tomorrow is not on the grid')

    fireEvent.dragStart(chip, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    await waitFor(() => expect(scheduleCalls).toHaveLength(1))
    const expected = new Date(tomorrow)
    expected.setHours(10, 30, 0, 0)
    expect(scheduleCalls[0]?.publishedAt).toBe(expected.toISOString())
  })

  /**
   * L35 left "pas de vue semaine" open. What matters is that it is the *same*
   * grid and the same writes, over seven days instead of forty-two — so a
   * scheduled entry of this week is still there, and still draggable.
   */
  it('switches to a week of seven days, keeps the entry, and comes back to the month', async () => {
    const chip = await screen.findByRole('button', { name: /Second article/u })
    const monthDays = document.querySelectorAll('[data-day]').length
    expect(monthDays).toBe(42)

    fireEvent.click(screen.getByRole('button', { name: 'Semaine' }))

    await waitFor(() => expect(document.querySelectorAll('[data-day]').length).toBe(7))
    expect(screen.getByRole('button', { name: 'Semaine' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    // An entry two days out belongs to this week: it is still on its own day.
    const inWeek = await screen.findByRole('button', { name: /Second article/u })
    expect(inWeek.closest('[data-day]')?.getAttribute('data-day')).toBe(dayKey(inTwoDays()))
    expect(chip).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Mois' }))
    await waitFor(() => expect(document.querySelectorAll('[data-day]').length).toBe(42))
  })

  it('moves a week at a time in the week view, and one month at a time in the month view', async () => {
    await screen.findByRole('button', { name: /Second article/u })
    // The period title is the one heading that announces itself politely.
    const heading = (): string =>
      screen
        .getAllByRole('heading', { level: 2 })
        .find((node) => node.getAttribute('aria-live') === 'polite')?.textContent ?? ''

    const monthTitle = heading()
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(heading()).not.toBe(monthTitle)

    fireEvent.click(screen.getByRole('button', { name: "Aujourd'hui" }))
    expect(heading()).toBe(monthTitle)

    fireEvent.click(screen.getByRole('button', { name: 'Semaine' }))
    await waitFor(() => expect(document.querySelectorAll('[data-day]').length).toBe(7))
    const weekTitle = heading()
    // A week title is a range of days, not a month name.
    expect(weekTitle).toContain('–')

    // The buttons say what they move, and what they move follows the view.
    fireEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    await waitFor(() => expect(heading()).not.toBe(weekTitle))
    expect(document.querySelectorAll('[data-day]').length).toBe(7)
  })

  it('does not offer to move what is already published', async () => {
    const published = await screen.findByRole('button', { name: /First article/u })
    expect(published.getAttribute('draggable')).toBe('false')

    fireEvent.click(published)
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: 'Reprogrammer' })).toBeNull()
    expect(within(dialog).getByText(/déjà en ligne/u)).toBeDefined()
  })
})
