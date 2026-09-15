import type { WidgetType } from '../api/widgets-client.js'

/**
 * How the admin presents each widget type (L30): which group of the library
 * it sits in, and the settings a new widget of that type starts from. Labels
 * and descriptions are translations (`widgets.types.<type>.*`); nothing here
 * is shown as text.
 */

export type WidgetGroup = 'content' | 'dynamic' | 'navigation'

export interface WidgetSources {
  readonly collections: readonly {
    readonly name: string
    readonly label: string
    readonly routed: boolean
  }[]
  readonly taxonomies: readonly { readonly name: string; readonly label: string }[]
  readonly menus: readonly { readonly id: string; readonly label: string }[]
  readonly forms: readonly { readonly name: string; readonly label: string }[]
}

export const WIDGET_GROUPS: readonly {
  readonly id: WidgetGroup
  readonly types: readonly WidgetType[]
}[] = [
  {
    id: 'content',
    types: ['text', 'image', 'gallery', 'embed', 'quote', 'cta', 'about', 'contact'],
  },
  {
    id: 'dynamic',
    types: [
      'recentEntries',
      'relatedEntries',
      'popularEntries',
      'recentComments',
      'archives',
      'calendar',
      'toc',
      'form',
    ],
  },
  {
    id: 'navigation',
    types: ['search', 'menu', 'links', 'terms', 'tagCloud', 'social'],
  },
]

/** Why a type cannot be added on this site yet, or `null` when it can. */
export function unavailableReason(type: WidgetType, sources: WidgetSources): string | null {
  switch (type) {
    case 'recentEntries':
    case 'archives':
    case 'calendar':
      return sources.collections.some((collection) => collection.routed) ? null : 'noCollection'
    case 'terms':
    case 'tagCloud':
      return sources.taxonomies.length > 0 ? null : 'noTaxonomy'
    case 'menu':
      return sources.menus.length > 0 ? null : 'noMenu'
    case 'form':
      return sources.forms.length > 0 ? null : 'noForm'
    default:
      return null
  }
}

/** Settings a new widget starts from: valid as they are, except where a picture has to be chosen. */
export function defaultSettings(
  type: WidgetType,
  sources: WidgetSources,
  words: {
    readonly sampleText: string
    readonly sampleHeading: string
    readonly sampleLink: string
  },
): Record<string, unknown> {
  const firstCollection = sources.collections.find((collection) => collection.routed)?.name ?? ''
  const firstTaxonomy = sources.taxonomies[0]?.name ?? ''
  switch (type) {
    case 'text':
      return {
        body: [
          {
            _key: 'p1',
            _type: 'block',
            style: 'normal',
            markDefs: [],
            children: [{ _key: 's1', _type: 'span', text: words.sampleText, marks: [] }],
          },
        ],
      }
    case 'image':
      return { media: '', alt: '', caption: '' }
    case 'gallery':
      return { media: [], columns: 3 }
    case 'embed':
      return { url: '', caption: '' }
    case 'quote':
      return { text: words.sampleText, attribution: '', role: '' }
    case 'cta':
      return { heading: words.sampleHeading, body: '', label: words.sampleLink, href: '/' }
    case 'links':
      return { items: [{ label: words.sampleLink, href: '/', newTab: false }] }
    case 'contact':
      return { address: '', phone: '', email: '', hours: [] }
    case 'about':
      return { heading: words.sampleHeading, body: words.sampleText }
    case 'recentEntries':
      return {
        collection: firstCollection,
        count: 5,
        showDate: true,
        showExcerpt: false,
        showImage: false,
      }
    case 'relatedEntries':
      return { count: 4, showDate: false, showImage: true }
    case 'popularEntries':
      return { count: 5, days: 30, showImage: false }
    case 'terms':
      return {
        taxonomy: firstTaxonomy,
        showCounts: true,
        hierarchical: true,
        hideEmpty: true,
        display: 'list',
      }
    case 'tagCloud':
      return { taxonomy: firstTaxonomy, maxTerms: 30, showCounts: false }
    case 'archives':
      return {
        collection: firstCollection,
        granularity: 'month',
        showCounts: true,
        display: 'list',
        limit: 24,
      }
    case 'recentComments':
      return { count: 5 }
    case 'search':
      return { placeholder: '' }
    case 'menu':
      return { menuId: sources.menus[0]?.id ?? '' }
    case 'social':
      return {}
    case 'form':
      return { form: sources.forms[0]?.name ?? '' }
    case 'toc':
      return { maxDepth: 3 }
    case 'calendar':
      return { collection: firstCollection }
  }
}
