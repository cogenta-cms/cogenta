import { type Child, h, text } from '@cogenta/theme-kit'

/**
 * The words of a link that ends (or starts) with an arrow.
 *
 * The arrow itself is drawn by the stylesheet, after the last word (or before
 * the first), on a `<span>` that also refuses to break: a long label wraps
 * between its earlier words, and the arrow always travels with a word. A
 * label of one word is that span alone.
 */
export function arrowWords(label: string, direction: 'forward' | 'back' = 'forward'): Child[] {
  const trimmed = label.trim()
  if (direction === 'back') {
    const at = trimmed.indexOf(' ')
    if (at === -1) return [h('span', { class: 'cg-arrow-link__start' }, trimmed)]
    return [
      h('span', { class: 'cg-arrow-link__start' }, trimmed.slice(0, at)),
      text(trimmed.slice(at)),
    ]
  }
  const at = trimmed.lastIndexOf(' ')
  if (at === -1) return [h('span', { class: 'cg-arrow-link__end' }, trimmed)]
  return [
    text(trimmed.slice(0, at + 1)),
    h('span', { class: 'cg-arrow-link__end' }, trimmed.slice(at + 1)),
  ]
}
