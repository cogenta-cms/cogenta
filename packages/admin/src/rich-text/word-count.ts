import type { RichTextDocument } from './portable-text.js'

/**
 * Word and character counter (fiche 04 task 4, "confort" item 10).
 *
 * Computed straight from the stored portable-text document rather than from
 * Slate's in-memory tree: it is the same shape `onChange` already hands the
 * field, so the editor never needs a second walk of its own nodes to answer
 * "how long is this".
 */
export interface TextStats {
  readonly words: number
  readonly characters: number
}

function textOf(document: RichTextDocument): string {
  const parts: string[] = []
  for (const node of document) {
    if (node._type !== 'block') continue
    for (const span of node.children) {
      if (span.text !== '') parts.push(span.text)
    }
  }
  return parts.join(' ')
}

export function countText(document: RichTextDocument): TextStats {
  const text = textOf(document).trim()
  if (text === '') return { words: 0, characters: 0 }
  const words = text.split(/\s+/u).length
  // Characters, not UTF-16 code units: `[...text]` iterates by code point, so
  // an emoji or an accented character composed as a single code point counts
  // once, the way a writer counts it.
  const characters = [...text].length
  return { words, characters }
}
