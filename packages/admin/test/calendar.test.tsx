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

  it('does not offer to move what is already published', async () => {
    const published = await screen.findByRole('button', { name: /First article/u })
    expect(published.getAttribute('draggable')).toBe('false')

    fireEvent.click(published)
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: 'Reprogrammer' })).toBeNull()
    expect(within(dialog).getByText(/déjà en ligne/u)).toBeDefined()
  })
})
