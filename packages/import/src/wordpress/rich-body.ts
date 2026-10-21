import type { RichTextDocument, RichTextNode } from '@cogenta/schema'
import type { ContentConversionNote, DraftBlock } from './content-convert.js'

/**
 * Folds the blocks a WordPress post was converted to into one rich-text
 * document, for a target whose body is a `richText` field rather than a block
 * zone (the shape every shipped site model uses for its articles).
 *
 * Prose keeps its structure; an image becomes a `media` node; a gallery
 * becomes one `media` node per picture; a quote becomes a blockquote; an
 * embed becomes a paragraph carrying a link to the original. Nothing is
 * dropped silently — what a rich-text document cannot carry is reported.
 */
export function blocksToRichText(
  blocks: readonly DraftBlock[],
  notes: ContentConversionNote[],
): RichTextDocument {
  const nodes: RichTextNode[] = []
  let counter = 0
  const key = (prefix: string): string => {
    counter += 1
    return `${prefix}-${counter}`
  }

  for (const block of blocks) {
    if (block._type === 'prose') {
      for (const node of block.body as RichTextDocument) {
        nodes.push(rekey(node, key))
      }
      continue
    }

    if (block._type === 'mediaFigure') {
      nodes.push({
        _key: key('media'),
        _type: 'media',
        id: block.media,
        ...(block.caption === undefined || block.caption === '' ? {} : { caption: block.caption }),
      })
      continue
    }

    if (block._type === 'gallery') {
      for (const item of block.items) {
        nodes.push({ _key: key('media'), _type: 'media', id: item.media })
      }
      continue
    }

    if (block._type === 'quote') {
      const attribution =
        block.author === undefined || block.author === '' ? '' : ` — ${block.author}`
      nodes.push({
        _key: key('quote'),
        _type: 'block',
        style: 'blockquote',
        children: [{ _key: key('span'), _type: 'span', text: `${block.text}${attribution}`, marks: [] }],
        markDefs: [],
      })
      continue
    }

    if (block._type === 'embed') {
      const linkKey = key('link')
      nodes.push({
        _key: key('embed'),
        _type: 'block',
        style: 'normal',
        children: [{ _key: key('span'), _type: 'span', text: block.url, marks: [linkKey] }],
        markDefs: [{ _key: linkKey, _type: 'link', href: block.url }],
      })
      notes.push({
        source: 'embed',
        reason: 'A rich-text body cannot hold an embedded player; it was kept as a link.',
      })
    }
  }

  return nodes
}

/** A copy of `node` with fresh keys, so two prose blocks merged into one document never collide. */
function rekey(node: RichTextNode, key: (prefix: string) => string): RichTextNode {
  if (node._type !== 'block') return { ...node, _key: key(node._type) }
  const renamed = new Map<string, string>()
  const markDefs = node.markDefs.map((definition) => {
    const next = key('mark')
    renamed.set(definition._key, next)
    return { ...definition, _key: next }
  })
  return {
    ...node,
    _key: key('block'),
    markDefs,
    children: node.children.map((child) => ({
      ...child,
      _key: key('span'),
      marks: child.marks.map((mark) => renamed.get(mark) ?? mark),
    })),
  }
}
