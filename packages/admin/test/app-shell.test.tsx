import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/app.js'

describe('App', () => {
  it('renders the dashboard by default, with the skip link and every nav item', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Aller au contenu principal' }).getAttribute('href'),
    ).toBe('#main-content')

    for (const label of ['Tableau de bord', 'Contenus', 'Médiathèque', "Journal d'audit"]) {
      expect(screen.getByRole('link', { name: label })).toBeDefined()
    }
  })

  it('marks the current section as the active link', () => {
    render(<App />)
    const dashboardLink = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(dashboardLink.getAttribute('aria-current')).toBe('page')

    const mediaLink = screen.getByRole('link', { name: 'Médiathèque' })
    expect(mediaLink.getAttribute('aria-current')).toBeNull()
  })

  it('navigates to another section without a full page reload', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'Médiathèque' }))

    expect(screen.getByRole('heading', { name: 'Médiathèque' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })

  it('gives the routed content a landmark the skip link can reach', () => {
    render(<App />)
    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
  })
})
