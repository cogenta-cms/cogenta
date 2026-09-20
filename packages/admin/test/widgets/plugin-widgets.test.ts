import { afterEach, describe, expect, it } from 'vitest'
import type { WidgetType } from '../../src/api/widgets-client.js'
import {
  defaultSettings,
  registerPluginWidgets,
  widgetGroups,
} from '../../src/widgets/widget-catalog.js'

/**
 * A widget type a plugin provides (L32 step 4) has to start from settings
 * like any other, and `defaultSettings` is a `switch` over the closed
 * vocabulary with no `default:` branch. A plugin's name is not one of those
 * cases — it only reaches the function because `widgetGroups` casts it
 * `as WidgetType`, and that cast is what silences the exhaustiveness check
 * that would otherwise have caught the missing branch.
 *
 * So the function fell off its own end and returned `undefined`. Placing the
 * starter plugin's "Chiffre clé" widget then read `settings.value` off it —
 * its first declared field happens to be named `value` — and the Widgets
 * screen went white with `Cannot read properties of undefined (reading
 * 'value')`.
 */

const SOURCES = { collections: [], taxonomies: [], menus: [], forms: [] }
const WORDS = { sampleText: 'Texte', sampleHeading: 'Titre', sampleLink: 'Lien' }

const KEY_FIGURE = {
  name: 'keyFigure',
  label: 'Chiffre clé',
  plugin: '@example/plugin-starter',
  fields: [
    { name: 'value', kind: 'text', required: true, localized: false, options: {} },
    { name: 'caption', kind: 'text', required: true, localized: false, options: {} },
  ],
} as const

afterEach(() => {
  registerPluginWidgets([])
})

describe('a widget type a plugin provides', () => {
  it('starts from real settings, never undefined', () => {
    registerPluginWidgets([KEY_FIGURE])

    const settings = defaultSettings('keyFigure' as WidgetType, SOURCES, WORDS)

    expect(settings).toBeDefined()
    // Reading a declared field off the result is exactly what the settings
    // form does the moment the widget is placed.
    expect(() => (settings as Record<string, unknown>)['value']).not.toThrow()
  })

  it('offers an empty value for every field it declares, so the form has something to bind to', () => {
    registerPluginWidgets([KEY_FIGURE])

    expect(defaultSettings('keyFigure' as WidgetType, SOURCES, WORDS)).toEqual({
      value: '',
      caption: '',
    })
  })

  it('appears in its own group of the library', () => {
    registerPluginWidgets([KEY_FIGURE])

    const plugins = widgetGroups().find((group) => group.id === 'plugins')
    expect(plugins?.types).toContain('keyFigure')
  })

  it('leaves the vocabulary types answering exactly as before', () => {
    registerPluginWidgets([KEY_FIGURE])

    expect(defaultSettings('recentComments' as WidgetType, SOURCES, WORDS)).toEqual({ count: 5 })
  })
})
