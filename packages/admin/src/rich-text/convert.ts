import {
  freshKey,
  RICH_TEXT_DECORATORS,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextMarkDefinition,
  type RichTextMediaNode,
  type RichTextNode,
  type RichTextSpan,
} from './portable-text.js'
import {
  type BlockElement,
  type CustomElement,
  type CustomText,
  type Descendant,
  styleOf,
} from './slate-types.js'

/** An empty document is not valid Slate — every editor needs at least one block to place a cursor in. */
const EMPTY_DOCUMENT: CustomElement[] = [{ type: 'paragraph', children: [{ text: '' }] }]

export function portableTextToSlate(document: RichTextDocument): CustomElement[] {
  if (document.length === 0) return EMPTY_DOCUMENT
  return document.map(nodeToSlate)
}

function nodeToSlate(node: RichTextNode): CustomElement {
  if (node._type === 'media') {
    return {
      type: 'media',
      mediaId: node.id,
      ...(node.caption === undefined ? {} : { caption: node.caption }),
      children: [{ text: '' }],
    }
  }

  const children = spansToSlate(node.children, node.markDefs)

  if (node.listItem !== undefined) {
    return { type: 'list-item', listType: node.listItem, level: node.level ?? 1, children }
  }
  if (node.style === 'h2' || node.style === 'h3' || node.style === 'h4') {
    return { type: node.style, children }
  }
  if (node.style === 'blockquote') {
    return { type: 'blockquote', children }
  }
  return { type: 'paragraph', children }
}

function spansToSlate(
  spans: readonly RichTextSpan[],
  markDefs: readonly RichTextMarkDefinition[],
): Descendant[] {
  if (spans.length === 0) return [{ text: '' }]

  const defsByKey = new Map(markDefs.map((def) => [def._key, def]))

  return spans.map((span): Descendant => {
    const leaf: CustomText = { text: span.text }
    for (const mark of span.marks) {
      if (mark === 'strong') leaf.strong = true
      else if (mark === 'em') leaf.em = true
      else if (mark === 'code') leaf.code = true
    }

    const linkMarkKey = span.marks.find((mark) => defsByKey.has(mark))
    if (linkMarkKey === undefined) return leaf

    const def = defsByKey.get(linkMarkKey)
    if (def === undefined) return leaf

    if (def._type === 'link') {
      return {
        type: 'link',
        kind: 'external',
        href: def.href,
        ...(def.rel === undefined ? {} : { rel: def.rel }),
        children: [leaf],
      }
    }
    return {
      type: 'link',
      kind: 'internal',
      collection: def.collection,
      entryId: def.id,
      children: [leaf],
    }
  })
}

export function slateToPortableText(nodes: readonly CustomElement[]): RichTextDocument {
  return nodes.map(blockToPortableText)
}

function blockToPortableText(element: CustomElement): RichTextNode {
  if (element.type === 'media') {
    const node: RichTextMediaNode = {
      _key: freshKey(),
      _type: 'media',
      id: element.mediaId,
      ...(element.caption === undefined ? {} : { caption: element.caption }),
    }
    return node
  }

  const markDefs: RichTextMarkDefinition[] = []
  const spans = flattenSpans(element.children, markDefs)

  const block: RichTextBlock = {
    _key: freshKey(),
    _type: 'block',
    style: styleOf(element as BlockElement),
    ...(element.type === 'list-item' ? { listItem: element.listType, level: element.level } : {}),
    children: spans,
    markDefs,
  }
  return block
}

/**
 * Slate nests a link element one level inside a block; contract A keeps the
 * block flat and expresses the link as a mark referring to `markDefs`. This
 * walk is what un-nests that one level back into the flat span list a
 * `RichTextBlock` expects.
 */
function flattenSpans(
  children: readonly Descendant[],
  markDefs: RichTextMarkDefinition[],
  inherited: readonly string[] = [],
): RichTextSpan[] {
  const spans: RichTextSpan[] = []

  for (const child of children) {
    if ('text' in child) {
      const marks = [...inherited, ...decoratorsOf(child)]
      spans.push({ _key: freshKey(), _type: 'span', text: child.text, marks })
      continue
    }

    if (child.type === 'link') {
      const key = freshKey()
      markDefs.push(
        child.kind === 'external'
          ? {
              _key: key,
              _type: 'link',
              href: child.href,
              ...(child.rel === undefined ? {} : { rel: child.rel }),
            }
          : { _key: key, _type: 'internalLink', collection: child.collection, id: child.entryId },
      )
      spans.push(...flattenSpans(child.children, markDefs, [...inherited, key]))
    }
  }

  return spans
}

function decoratorsOf(leaf: CustomText): string[] {
  return RICH_TEXT_DECORATORS.filter((decorator) => leaf[decorator] === true)
}
