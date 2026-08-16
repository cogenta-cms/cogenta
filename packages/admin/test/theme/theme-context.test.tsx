import { fireEvent, render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from '../../src/theme/theme-context.js'

const THEME_STORAGE_KEY = 'cogenta.admin.theme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

function ThemeHarness(): JSX.Element {
  const { mode, resolved, setMode } = useTheme()
  return (
    <div>
      <p data-testid="mode">{mode}</p>
      <p data-testid="resolved">{resolved}</p>
      <button type="button" onClick={() => setMode('light')}>
        light
      </button>
      <button type="button" onClick={() => setMode('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setMode('system')}>
        system
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  it('defaults to "system", with no data-theme attribute on <html>', () => {
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('sets data-theme="dark" on <html> and persists the choice', () => {
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('sets data-theme="light" on <html> and persists the choice', () => {
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'light' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('removes the attribute and the stored override when switching back to "system"', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'system' }))

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('picks up a mode already stored from a previous session on mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('ignores a stored value outside the known modes, falling back to "system"', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('system')
  })
})
