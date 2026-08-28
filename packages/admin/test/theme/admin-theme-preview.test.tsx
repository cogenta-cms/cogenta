import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AdminThemeTemplate } from '../../src/api/admin-theme-client.js'
import { AdminThemePreview } from '../../src/theme/admin-theme-preview.js'

/**
 * `AdminThemePreview` (fiche 49 tasks 2-3) — a real, scoped preview panel,
 * not a snapshot of four flat colour swatches. Every assertion here checks
 * the actually-rendered scoped `<style>` text, the same mechanism the
 * gallery and personalisation screens both rely on.
 */

function colors(background: string, primary: string) {
  return {
    background,
    foreground: '#111111',
    card: '#ffffff',
    cardForeground: '#111111',
    muted: '#eeeeee',
    mutedForeground: '#555555',
    border: '#dddddd',
    input: '#cccccc',
    ring: primary,
    primary,
    primaryForeground: '#ffffff',
    secondary: '#f5f5f5',
    secondaryForeground: '#111111',
    accent: '#f0f0f0',
    accentForeground: '#222222',
    destructive: '#c00000',
    destructiveForeground: '#ffffff',
    destructiveSurface: '#fde8e8',
    success: '#0a0',
    successForeground: '#ffffff',
    successSurface: '#e6f7e6',
    warning: '#a60',
    warningForeground: '#ffffff',
    warningSurface: '#fdf0dc',
    info: '#06c',
    infoForeground: '#ffffff',
    infoSurface: '#e0eefd',
    shadowCard: '0 1px 2px rgba(0,0,0,.1)',
    shadowRaised: '0 4px 8px rgba(0,0,0,.1)',
    shadowOverlay: '0 8px 16px rgba(0,0,0,.1)',
  }
}

const NIGHTOPS: AdminThemeTemplate = {
  id: 'nightops',
  name: 'Nightops',
  description: 'A near-black console.',
  light: colors('#fafafa', '#16a34a'),
  dark: colors('#0a0b0d', '#22c55e'),
  radius: { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
  fontDisplay: 'space-grotesk',
  fontBody: 'space-grotesk',
}

describe('AdminThemePreview', () => {
  it('renders the template name and description as real, visible text', () => {
    render(<AdminThemePreview template={NIGHTOPS} />)
    expect(screen.getByText('Nightops')).toBeDefined()
    expect(screen.getByText('A near-black console.')).toBeDefined()
  })

  it('is scoped to its own selector rather than `:root`, so it can never repaint the page', () => {
    const { container } = render(<AdminThemePreview template={NIGHTOPS} />)
    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent ?? '').not.toContain(':root')
    expect(style?.textContent ?? '').toContain('--primary: #16a34a;')
  })

  it('reflects a pending, unsaved override immediately', () => {
    const { container } = render(
      <AdminThemePreview template={NIGHTOPS} overrides={{ primaryColor: '#ff00ff' }} />,
    )
    const style = container.querySelector('style')
    expect(style?.textContent ?? '').toContain('--primary: #ff00ff;')
  })

  it('is decorative: hidden from assistive tech and no focusable dummy controls', () => {
    const { container } = render(<AdminThemePreview template={NIGHTOPS} />)
    const root = container.querySelector('[aria-hidden="true"]')
    expect(root).not.toBeNull()
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of Array.from(buttons)) {
      expect(button.getAttribute('tabindex')).toBe('-1')
    }
  })

  it('two instances never collide on the same selector', () => {
    const { container } = render(
      <>
        <AdminThemePreview template={NIGHTOPS} />
        <AdminThemePreview template={NIGHTOPS} overrides={{ primaryColor: '#ff00ff' }} />
      </>,
    )
    const scopes = Array.from(container.querySelectorAll('[data-admin-theme-preview]')).map(
      (element) => element.getAttribute('data-admin-theme-preview'),
    )
    expect(new Set(scopes).size).toBe(2)
  })
})
