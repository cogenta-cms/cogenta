import type { RichTextDocument } from '@cogenta/schema'

/**
 * Rich text, written as data: the handful of builders the blog blueprint's
 * essays and pages are made of. Shared by the English and the French copy so
 * both languages produce exactly the same node shapes.
 */

type RichNode = RichTextDocument[number]

let nodeKey = 0

function nextKey(prefix: string): string {
  nodeKey += 1
  return `${prefix}-${nodeKey}`
}

/**
 * A run of text, where `*words*` is set in italic (book titles, a stressed
 * word). Nothing else is interpreted: this is plain text with one mark.
 */
function spans(text: string, key: string) {
  return text
    .split(/(\*[^*]+\*)/)
    .filter((part) => part !== '')
    .map((part, index) => {
      const italic = part.startsWith('*') && part.endsWith('*') && part.length > 2
      return {
        _key: `${key}-s${index}`,
        _type: 'span' as const,
        text: italic ? part.slice(1, -1) : part,
        marks: italic ? ['em'] : [],
      }
    })
}

function textBlock(
  style: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote',
  text: string,
  listItem?: 'bullet' | 'number',
): RichNode {
  const key = nextKey(`blog-${listItem ?? style}`)
  return {
    _key: key,
    _type: 'block',
    style,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
    children: spans(text, key),
    markDefs: [],
  }
}

export const p = (text: string): RichNode => textBlock('normal', text)
export const h2 = (text: string): RichNode => textBlock('h2', text)
export const h4 = (text: string): RichNode => textBlock('h4', text)
export const quote = (text: string): RichNode => textBlock('blockquote', text)
export const bullet = (text: string): RichNode => textBlock('normal', text, 'bullet')
export const numbered = (text: string): RichNode => textBlock('normal', text, 'number')
export const rule = (): RichNode => ({ _key: nextKey('blog-hr'), _type: 'hr' })

/** A photograph inside the text, when the scaffold ingested it; nothing otherwise. */
export function figure(mediaId: string | undefined, caption: string): readonly RichNode[] {
  if (mediaId === undefined) return []
  return [{ _key: nextKey('blog-figure'), _type: 'media', id: mediaId, caption }]
}

/** A one-paragraph document, for a FAQ answer. */
export function answer(text: string): RichTextDocument {
  return [p(text)]
}
