import { z } from 'zod'

/**
 * Matches an opening or closing HTML tag, and nothing that a human writes on
 * purpose. `a < b` and `5 > 3` stay valid text; `<p>`, `</em>`, `<img src=…/>`
 * and `<div class="hero">` do not.
 */
const HTML_TAG = /<\/?[a-zA-Z][\w:-]*(\s[^<>]*)?\/?>/

export function containsMarkup(value: string): boolean {
  return HTML_TAG.test(value)
}

/**
 * A text value that may not carry markup.
 *
 * This is rule R3 enforced at the smallest possible scale. A block stores
 * semantic data; the moment a `<span class="highlight">` survives a write, the
 * theme stops owning presentation and every later skin change becomes a content
 * migration. Refusing it at the field boundary is cheaper than detecting it at
 * render time.
 */
export const plainTextSchema = z.string().refine((value) => !containsMarkup(value), {
  error: 'must be plain text: a block never stores HTML or CSS (rule R3)',
})
