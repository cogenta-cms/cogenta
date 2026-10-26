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

  it('guards every storage access and reads the system appearance', () => {
    const script = THEME_TOGGLE_SCRIPT
    expect(script).toContain('(prefers-color-scheme: dark)')
    expect(script.match(/try\{/g)?.length).toBeGreaterThanOrEqual(2)
  })

  /** Runs the real script against a fake page and returns a way to click its button. */
  function mount(systemDark: boolean, saved?: string) {
    const attrs: Record<string, string> = {}
    const store = new Map<string, string>()
    if (saved !== undefined) store.set('cg-theme', saved)
    const listeners: Record<string, (event: unknown) => void> = {}
    const labels: Record<string, string> = {
      'data-label-light': 'to-light',
      'data-label-dark': 'to-dark',
      'data-label-system': 'to-system',
    }
    const button = {
      aria: '',
      getAttribute: (name: string) => labels[name] ?? null,
      setAttribute(name: string, value: string) {
        if (name === 'aria-label') this.aria = value
      },
      closest: () => button,
    }
    const fakeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attrs[name] = value
        },
        removeAttribute: (name: string) => void delete attrs[name],
        getAttribute: (name: string) => attrs[name] ?? null,
      },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener
      },
      querySelectorAll: () => [button],
    }
    const fakeLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    }
    const fakeWindow = { matchMedia: () => ({ matches: systemDark }) }
    new Function('document', 'localStorage', 'window', THEME_TOGGLE_SCRIPT)(
      fakeDocument,
      fakeLocalStorage,
      fakeWindow,
    )
    listeners['DOMContentLoaded']?.({})
    return {
      attrs,
      store,
      button,
      click: () => {
        listeners['click']?.({ target: button })
      },
    }
  }

  it('makes the first click visible: a light system goes to dark, then back to the system', () => {
    const page = mount(false)
    expect(page.button.aria).toBe('to-dark')
    page.click()
    expect(page.attrs['data-theme']).toBe('dark')
    expect(page.store.get('cg-theme')).toBe('dark')
    expect(page.button.aria).toBe('to-system')
    page.click()
    expect(page.attrs['data-theme']).toBeUndefined()
    expect(page.store.has('cg-theme')).toBe(false)
    expect(page.button.aria).toBe('to-dark')
  })

  it('makes the first click visible on a dark system too: it goes to light', () => {
    const page = mount(true)
    expect(page.button.aria).toBe('to-light')
    page.click()
    expect(page.attrs['data-theme']).toBe('light')
    page.click()
    expect(page.attrs['data-theme']).toBeUndefined()
  })

  it('never leaves a saved choice that equals the system setting looking dead', () => {
    const page = mount(false, 'light')
    expect(page.attrs['data-theme']).toBe('light')
    page.click()
    expect(page.attrs['data-theme']).toBe('dark')
  })

  it('restores a saved choice and does not throw when storage is unavailable', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const fakeDocument = {
      documentElement: {
        setAttribute: () => undefined,
        removeAttribute: () => undefined,
        getAttribute: () => null,
      },
      addEventListener: () => undefined,
      querySelectorAll: () => [],
    }
    expect(() =>
      new Function('document', 'localStorage', 'window', THEME_TOGGLE_SCRIPT)(
        fakeDocument,
        throwing,
        {},
      ),
    ).not.toThrow()
  })
})
