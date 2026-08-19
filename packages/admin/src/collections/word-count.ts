import type { RichTextDocument } from '../rich-text/portable-text.js'

/**
 * Word count and reading time (fiche 02 task 5).
 *
 * `richText`'s plain text is read by walking the portable-text document's
 * `children[].text` — `JSON.stringify`-ing the document and counting words in
 * that would count `_key`, `_type`, `style` and every other structural key as
 * "words", wildly inflating the number for anyone who actually writes
 * headings or links.
 */

/** Every span's text, joined with a space — link text and plain text alike, since both read aloud the same way. */
export function plainTextOfRichText(document: RichTextDocument | null | undefined): string {
  // `defaultValueFor('richText')` hands out `null` for a freshly placed
  // block's field, not `undefined` — both mean "nothing written yet".
  if (document === undefined || document === null) return ''
  const parts: string[] = []
  for (const node of document) {
    if (node._type !== 'block') continue
    for (const span of node.children) {
      if (span.text.length > 0) parts.push(span.text)
    }
  }
  return parts.join(' ')
}

/** Splits on runs of whitespace; an empty or whitespace-only string counts as zero words, never one. */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length
}

/** Rounded up to the next whole minute, floored at one — "0 min" reads as broken, not as fast. */
export function readingTimeMinutes(words: number, wordsPerMinute = 200): number {
  return Math.max(1, Math.ceil(words / wordsPerMinute))
}
