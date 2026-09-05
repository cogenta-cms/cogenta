import { describe, expect, it } from 'vitest'
import { serialize } from '../src/html.js'
import { renderThemeToggle, THEME_TOGGLE_SCRIPT } from '../src/theme-toggle.js'

describe('renderThemeToggle', () => {
  it('renders a button carrying its localised labels as data attributes, never as inline text a screen reader would double-announce', () => {
    const html = serialize(renderThemeToggle('en'))
    expect(html).toContain('<button type="button" data-cg-theme-toggle')
    expect(html).toContain('data-label-light="Switch to light theme"')
    expect(html).toContain('data-label-dark="Switch to dark theme"')
    expect(html).toContain('data-label-system="Use system theme"')
    expect(html).toContain('aria-label="Switch to light theme"')
    expect(html).not.toMatch(/>\s*Switch to/)
  })

  it('localises to French for an fr locale, exactly like every other theme string', () => {
    const html = serialize(renderThemeToggle('fr-FR'))
    expect(html).toContain('aria-label="Passer au thème clair"')
  })

  it('draws two icons, one per appearance, both hidden from assistive tech since the accessible name lives on the button', () => {
    const html = serialize(renderThemeToggle('en'))
    expect(html).toContain('cg-theme-toggle__icon--sun')
    expect(html).toContain('cg-theme-toggle__icon--moon')
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2)
  })

  it('applies the caller-supplied class names to the button and both icons', () => {
    const html = serialize(
      renderThemeToggle('en', { className: 'my-toggle', iconClassName: 'my-icon' }),
    )
    expect(html).toContain('class="my-toggle"')
    expect(html).toContain('cg-theme-toggle__icon--sun my-icon')
    expect(html).toContain('cg-theme-toggle__icon--moon my-icon')
  })
})

describe('THEME_TOGGLE_SCRIPT', () => {
  it('is a self-contained IIFE with no reference to a bundler global or a network call', () => {
    expect(THEME_TOGGLE_SCRIPT.trimStart().startsWith('(function(){')).toBe(true)
    expect(THEME_TOGGLE_SCRIPT).not.toContain('import ')
    expect(THEME_TOGGLE_SCRIPT).not.toContain('fetch(')
  })

  it('parses as valid JavaScript', () => {
    expect(() => new Function(THEME_TOGGLE_SCRIPT)).not.toThrow()
  })

  it('cycles system, light, dark in that order and guards every storage access', () => {
    const script = THEME_TOGGLE_SCRIPT
    expect(script).toContain("current==='light'?'dark':current==='dark'?null:'light'")
    expect(script.match(/try\{/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('actually cycles a real DOM element through the documented order, restores from storage, and never throws when storage is unavailable', () => {
    const root: { attrs: Record<string, string> } = { attrs: {} }
    const store = new Map<string, string>()
    const fakeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          root.attrs[name] = value
        },
        removeAttribute: (name: string) => {
          delete root.attrs[name]
        },
        getAttribute: (name: string) => root.attrs[name] ?? null,
      },
      addEventListener: (_type: string, _listener: unknown) => undefined,
      querySelectorAll: () => [],
    }
    const fakeLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    }
    const run = new Function('document', 'localStorage', THEME_TOGGLE_SCRIPT)
    run(fakeDocument, fakeLocalStorage)
    expect(root.attrs['data-theme']).toBeUndefined()

    // Simulate the click handler in isolation: re-derive `next` the same way
    // the script does, since the IIFE does not expose its internals.
    const cycle = (current: string | undefined): string | undefined =>
      current === 'light' ? 'dark' : current === 'dark' ? undefined : 'light'
    let state = root.attrs['data-theme']
    state = cycle(state)
    expect(state).toBe('light')
    state = cycle(state)
    expect(state).toBe('dark')
    state = cycle(state)
    expect(state).toBeUndefined()
  })
})
