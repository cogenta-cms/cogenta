import { type HtmlElement, h, renderIcon } from '@cogenta/theme-kit'
import { word } from './strings.js'

/**
 * The search field: a real `GET /search?q=` form, answered by the host's own
 * search page (`cogenta serve`), so it works without a line of client
 * JavaScript. One input, submitted with Enter; the label is visually hidden
 * because the magnifier and the placeholder already say what the field is,
 * and a screen reader still hears the full name.
 *
 * Two sizes: compact in the header, large at the top of the home page. Each
 * copy on a page has its own `id`, so every label points at its own input.
 */

export const SEARCH_PATH = '/search'

export type SearchSize = 'compact' | 'large'

export function renderSearchForm(locale: string, id: string, size: SearchSize): HtmlElement {
  return h(
    'form',
    {
      class: size === 'large' ? 'cd-search cd-search--large' : 'cd-search',
      action: SEARCH_PATH,
      method: 'get',
      role: 'search',
    },
    h('label', { class: 'cg-visually-hidden', for: id }, word(locale, 'searchLabel')),
    renderIcon('search', { className: 'cd-search__icon', size: 20 }),
    h('input', {
      id,
      class: 'cd-search__input',
      type: 'search',
      name: 'q',
      placeholder: word(locale, 'searchPlaceholder'),
      autocomplete: 'off',
      spellcheck: 'false',
      required: true,
    }),
  )
}
